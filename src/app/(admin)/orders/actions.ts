"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin, requireOwner } from "@/lib/current-admin";
import { kronorToOre } from "@/lib/money-input";
import { formatOre } from "@/lib/format";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import { resolveCartLine } from "@/lib/queries/cart";
import {
  KustomApiError,
  cancelOrder,
  captureOrder,
  getOrderManagementOrder,
  refundOrder,
} from "@/lib/kustom/client";

function kustomErrorMessage(err: unknown): string {
  if (err instanceof KustomApiError) {
    return `Kustom svarade med fel (${err.status}). Försök igen eller kontrollera ordern hos Kustom.`;
  }
  return err instanceof Error ? err.message : "Något gick fel.";
}

async function getOrderOrRedirect(orderId: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) {
    redirect("/orders?error=" + encodeURIComponent("Ordern hittades inte."));
  }
  return order;
}

/** Synkar vårt cachade belopp/status från Kustoms Order Management efter varje åtgärd - Kustom är alltid facit. */
async function syncOrderFromKustom(orderId: string, kustomOrderId: string) {
  const fresh = await getOrderManagementOrder(kustomOrderId);
  await db
    .update(schema.orders)
    .set({
      capturedAmountOre: fresh.captured_amount,
      refundedAmountOre: fresh.refunded_amount,
      status: fresh.status,
      paymentStatus: fresh.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId));
}

export async function captureOrderAction(orderId: string, formData: FormData) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  const remaining = order.orderAmountOre - order.capturedAmountOre;
  const rawAmount = formData.get("amount")?.toString().trim();
  const amountOre = rawAmount ? kronorToOre(rawAmount) : remaining;
  const description = formData.get("description")?.toString().trim() || undefined;

  if (!Number.isInteger(amountOre) || amountOre <= 0 || amountOre > remaining) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ogiltigt belopp att debitera.")}`);
  }

  try {
    await captureOrder(
      order.kustomOrderId,
      { captured_amount: amountOre, description },
      crypto.randomUUID(),
    );
    await syncOrderFromKustom(orderId, order.kustomOrderId);
    await db.insert(schema.orderEvents).values({
      orderId,
      type: "capture",
      amountOre,
      note: description ?? null,
      causedByAdminId: admin.id,
    });
  } catch (err) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(kustomErrorMessage(err))}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

async function refund(orderId: string, amountOre: number, description?: string) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);
  const remaining = order.capturedAmountOre - order.refundedAmountOre;

  if (!Number.isInteger(amountOre) || amountOre <= 0 || amountOre > remaining) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ogiltigt belopp att återbetala.")}`);
  }

  try {
    await refundOrder(
      order.kustomOrderId,
      { refunded_amount: amountOre, description },
      crypto.randomUUID(),
    );
    await syncOrderFromKustom(orderId, order.kustomOrderId);
    await db.insert(schema.orderEvents).values({
      orderId,
      type: "refund",
      amountOre,
      note: description ?? null,
      causedByAdminId: admin.id,
    });
  } catch (err) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(kustomErrorMessage(err))}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function refundPartialAction(orderId: string, formData: FormData) {
  const amountOre = kronorToOre(formData.get("amount")?.toString());
  const description = formData.get("description")?.toString().trim() || undefined;
  await refund(orderId, amountOre, description);
}

export async function refundFullAction(orderId: string) {
  const order = await getOrderOrRedirect(orderId);
  const remaining = order.capturedAmountOre - order.refundedAmountOre;
  await refund(orderId, remaining, "Full återbetalning");
}

export async function cancelOrderAction(orderId: string) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  try {
    await cancelOrder(order.kustomOrderId, crypto.randomUUID());

    const lines = await db
      .select()
      .from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, orderId));

    await db.transaction(async (tx) => {
      await tx
        .update(schema.orders)
        .set({
          status: "CANCELLED",
          paymentStatus: "CANCELLED",
          fulfillmentStatus: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId));
      await tx.insert(schema.orderEvents).values({
        orderId,
        type: "cancel",
        causedByAdminId: admin.id,
      });

      // Ordern var reserverad (canCancel tillåter bara avbokning innan
      // något fångats/skickats) - släpp reservationen så lagret blir
      // rätt igen, precis som markShippedAction gör vid leverans.
      for (const line of lines) {
        if (line.type !== "physical" || !line.reference) continue;
        const resolved = await resolveCartLine(line.reference, { requirePublished: false });
        if (!resolved) continue;

        const targets = await expandLineToInventoryTargets(
          tx,
          resolved.productId,
          resolved.variantId,
          line.quantity,
        );

        for (const target of targets) {
          const condition = target.variantId
            ? and(
                eq(schema.inventory.productId, target.productId),
                eq(schema.inventory.variantId, target.variantId),
              )
            : and(
                eq(schema.inventory.productId, target.productId),
                isNull(schema.inventory.variantId),
              );

          const [inventoryRow] = await tx
            .select({ id: schema.inventory.id })
            .from(schema.inventory)
            .where(condition);

          if (!inventoryRow) continue;

          await tx
            .update(schema.inventory)
            .set({
              reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${target.quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.inventory.id, inventoryRow.id));

          await tx.insert(schema.inventoryMovements).values({
            inventoryId: inventoryRow.id,
            changeAmount: -target.quantity,
            reason: "order_released",
            orderId,
            note:
              target.productId === resolved.productId
                ? "Reservation släppt: ordern avbruten"
                : `Reservation släppt: ordern avbruten (komponent i "${resolved.nameSv}")`,
          });
        }
      }
    });
  } catch (err) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(kustomErrorMessage(err))}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * Byter en orderrad mot en annan SKU - t.ex. en kund som ändrat sig och
 * vill ha helböna i stället för malet. Bara mellan SKU:er med EXAKT
 * samma pris och momssats: ordersumman (och därmed det som redan
 * debiterats hos Kustom) ska aldrig ändras av ett byte, så priskänsliga
 * byten blockeras helt i stället för att kräva manuell efterdebitering/
 * återbetalning. Släpper reservationen på den gamla SKU:n och reserverar
 * den nya, med samma expandLineToInventoryTargets-mekanik (kit-
 * expansion m.m.) som resten av lagersystemet - orderraden i sig
 * (kvantitet, pris, moms, totalsumma) ändras aldrig, bara namn/SKU.
 * Bara tillåtet innan ordern fysiskt skickats/avbrutits.
 */
export async function editOrderLineAction(orderId: string, lineId: string, formData: FormData) {
  await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  if (order.fulfillmentStatus !== "unfulfilled" && order.fulfillmentStatus !== "label_created") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Ordern är redan skickad eller avbruten - går inte att ändra.")}`,
    );
  }

  const [line] = await db
    .select()
    .from(schema.orderLines)
    .where(and(eq(schema.orderLines.id, lineId), eq(schema.orderLines.orderId, orderId)));
  if (!line || line.type !== "physical") {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Orderraden hittades inte.")}`);
  }

  const newSku = formData.get("newSku")?.toString().trim();
  if (!newSku || newSku === line.reference) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ange en annan SKU att byta till.")}`);
  }

  const [oldResolved, newResolved] = await Promise.all([
    resolveCartLine(line.reference, { requirePublished: false }),
    resolveCartLine(newSku, { requirePublished: true }),
  ]);

  if (!oldResolved) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Den nuvarande SKU:n hittades inte - kan inte byta säkert.")}`,
    );
  }
  if (!newResolved) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(`"${newSku}" hittades inte eller är inte publicerad.`)}`,
    );
  }
  if (newResolved.priceOre !== line.unitPriceOre || newResolved.taxRate !== line.taxRate) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(
        `Kan bara byta till en SKU med exakt samma pris - "${newSku}" kostar ${formatOre(newResolved.priceOre)}, orderraden kostar ${formatOre(line.unitPriceOre)}.`,
      )}`,
    );
  }
  if (newResolved.available < line.quantity) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(
        `Inte tillräckligt i lager av "${newSku}" (${newResolved.available} tillgängligt, behöver ${line.quantity}).`,
      )}`,
    );
  }

  const newName = order.locale === "en-SE" ? newResolved.nameEn : newResolved.nameSv;

  await db.transaction(async (tx) => {
    const releaseTargets = await expandLineToInventoryTargets(
      tx,
      oldResolved.productId,
      oldResolved.variantId,
      line.quantity,
    );
    for (const target of releaseTargets) {
      const condition = target.variantId
        ? and(
            eq(schema.inventory.productId, target.productId),
            eq(schema.inventory.variantId, target.variantId),
          )
        : and(
            eq(schema.inventory.productId, target.productId),
            isNull(schema.inventory.variantId),
          );

      const [inventoryRow] = await tx
        .select({ id: schema.inventory.id })
        .from(schema.inventory)
        .where(condition);
      if (!inventoryRow) continue;

      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${target.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.inventory.id, inventoryRow.id));

      await tx.insert(schema.inventoryMovements).values({
        inventoryId: inventoryRow.id,
        changeAmount: -target.quantity,
        reason: "order_released",
        orderId,
        note:
          target.productId === oldResolved.productId
            ? `Reservation släppt: bytt till "${newSku}"`
            : `Reservation släppt: bytt till "${newSku}" (komponent i "${oldResolved.nameSv}")`,
      });
    }

    const reserveTargets = await expandLineToInventoryTargets(
      tx,
      newResolved.productId,
      newResolved.variantId,
      line.quantity,
    );
    for (const target of reserveTargets) {
      const condition = target.variantId
        ? and(
            eq(schema.inventory.productId, target.productId),
            eq(schema.inventory.variantId, target.variantId),
          )
        : and(
            eq(schema.inventory.productId, target.productId),
            isNull(schema.inventory.variantId),
          );

      const [inventoryRow] = await tx
        .select({ id: schema.inventory.id })
        .from(schema.inventory)
        .where(condition);
      if (!inventoryRow) continue;

      await tx
        .update(schema.inventory)
        .set({
          reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${target.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.inventory.id, inventoryRow.id));

      await tx.insert(schema.inventoryMovements).values({
        inventoryId: inventoryRow.id,
        changeAmount: target.quantity,
        reason: "order_reserved",
        orderId,
        note:
          target.productId === newResolved.productId
            ? `Reserverat: bytt från "${line.reference}"`
            : `Reserverat: bytt från "${line.reference}" (komponent i "${newResolved.nameSv}")`,
      });
    }

    await tx
      .update(schema.orderLines)
      .set({ productId: newResolved.productId, reference: newSku, name: newName })
      .where(eq(schema.orderLines.id, lineId));
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * Markerar att en fraktsedel skapats hos PostNord (t.ex. manuellt i
 * deras portal) men paketet inte lämnats/hämtats än - en mellanstatus
 * mellan "Ej skickad" och "Skickad". Rör INTE lagret (ingen rad i
 * `shipments`, ingen inventoryMovement) - reservationen som gjordes när
 * ordern kom in ligger kvar orörd tills markShippedAction faktiskt kör
 * (se computeTrueReservedQuantities i order-line-totals.ts, som räknar
 * "label_created" som fortsatt reserverat).
 */
export async function markLabelCreatedAction(orderId: string, formData: FormData) {
  await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  if (order.fulfillmentStatus !== "unfulfilled") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent('Ordern är inte längre "Ej skickad".')}`,
    );
  }

  const trackingNumber = formData.get("trackingNumber")?.toString().trim() || null;

  await db
    .update(schema.orders)
    .set({
      fulfillmentStatus: "label_created",
      labelTrackingNumber: trackingNumber,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId));

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function markShippedAction(orderId: string, formData: FormData) {
  await requireCurrentAdmin();
  const carrier = formData.get("carrier")?.toString().trim();
  const trackingNumber = formData.get("trackingNumber")?.toString().trim();

  if (!carrier || !trackingNumber) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Ange fraktbolag och spårningsnummer.")}`,
    );
  }

  const lines = await db
    .select()
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, orderId));

  await db.transaction(async (tx) => {
    await tx.insert(schema.shipments).values({ orderId, carrier, trackingNumber });
    await tx
      .update(schema.orders)
      .set({ fulfillmentStatus: "shipped", updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));

    for (const line of lines) {
      if (line.type !== "physical" || !line.reference) continue;
      const resolved = await resolveCartLine(line.reference, { requirePublished: false });
      if (!resolved) continue;

      const targets = await expandLineToInventoryTargets(
        tx,
        resolved.productId,
        resolved.variantId,
        line.quantity,
      );

      for (const target of targets) {
        const condition = target.variantId
          ? and(
              eq(schema.inventory.productId, target.productId),
              eq(schema.inventory.variantId, target.variantId),
            )
          : and(
              eq(schema.inventory.productId, target.productId),
              isNull(schema.inventory.variantId),
            );

        const [inventoryRow] = await tx
          .select({ id: schema.inventory.id })
          .from(schema.inventory)
          .where(condition);

        if (!inventoryRow) continue;

        // "I lager" (quantity) rörs INTE vid leverans - den är
        // ursprungslager, satt bara av admin (se schema/catalog.ts).
        // Reservationen släpps och skickat-räknaren ökar i stället, så
        // "Tillgängligt"/kassans lagerkoll (quantity - reserverat -
        // skickat) blir rätt automatiskt.
        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${target.quantity}`,
            shippedQuantity: sql`${schema.inventory.shippedQuantity} + ${target.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.inventory.id, inventoryRow.id));

        await tx.insert(schema.inventoryMovements).values({
          inventoryId: inventoryRow.id,
          changeAmount: target.quantity,
          reason: "order_shipped",
          orderId,
          note:
            target.productId === resolved.productId
              ? `Skickad: ${carrier} ${trackingNumber}`
              : `Skickad: ${carrier} ${trackingNumber} (komponent i "${resolved.nameSv}")`,
        });
      }
    }
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * Tar bort en order permanent - antingen en testorder (order.is_test =
 * true, från Kustom Playground) eller en AVBRUTEN order (fulfillment_
 * status = cancelled, t.ex. en egen testbeställning på skarpa sajten
 * som avbrutits via "Avbryt"-knappen). Blockerad för alla andra ordrar
 * oavsett vem som anropar, som ett extra skydd utöver ägarkravet -
 * riktiga, pågående eller skickade ordrar kan aldrig tas bort härifrån.
 * En avbruten order har alltid capturedAmountOre = 0 (cancelOrderAction
 * tillåter bara avbokning innan något debiterats), så ingen pengaflytt
 * att reversera - bara lagerrörelserna.
 *
 * Reverserar de lagerförändringar ordern orsakat (reservation, avbokad
 * reservation och/eller avdrag vid "Markera skickad") innan raden tas
 * bort, så lagersaldot blir precis som om ordern aldrig lagts - annars
 * hade borttagning bara städat bort ordern och lämnat kvar en felaktig
 * reservation/minskning i lagret.
 */
export async function deleteOrderAction(orderId: string) {
  await requireOwner();

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) {
    redirect("/orders?error=" + encodeURIComponent("Ordern hittades inte."));
  }
  if (!order.isTest && order.fulfillmentStatus !== "cancelled") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Bara testordrar eller avbrutna ordrar kan tas bort.")}`,
    );
  }

  await db.transaction(async (tx) => {
    const movements = await tx
      .select()
      .from(schema.inventoryMovements)
      .where(eq(schema.inventoryMovements.orderId, orderId));

    for (const movement of movements) {
      if (movement.reason === "order_reserved" || movement.reason === "order_released") {
        // Bägge påverkar bara reserved_quantity - changeAmount är redan
        // positivt (reserverat) eller negativt (släppt), så samma
        // reversering (dra av changeAmount) fungerar för båda.
        await tx
          .update(schema.inventory)
          .set({
            reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${movement.changeAmount}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.inventory.id, movement.inventoryId));
      } else if (movement.reason === "order_shipped") {
        // "I lager" (quantity) rörs aldrig av leverans (se markShippedAction)
        // - reversera i stället skickat-ökningen och återställ
        // reservationen som släpptes när ordern skickades.
        await tx
          .update(schema.inventory)
          .set({
            shippedQuantity: sql`${schema.inventory.shippedQuantity} - ${movement.changeAmount}`,
            reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${movement.changeAmount}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.inventory.id, movement.inventoryId));
      } else {
        throw new Error(
          `Okänd lagerorsak "${movement.reason}" på ordern - avbryter borttagningen för säkerhets skull.`,
        );
      }
    }

    await tx.delete(schema.inventoryMovements).where(eq(schema.inventoryMovements.orderId, orderId));
    await tx.delete(schema.orders).where(eq(schema.orders.id, orderId));
  }).catch((err) => {
    const message = err instanceof Error ? err.message : "Något gick fel.";
    redirect(`/orders/${orderId}?error=${encodeURIComponent(message)}`);
  });

  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/");
  redirect("/orders?deleted=1");
}

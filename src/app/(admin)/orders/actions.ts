"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin, requireOwner } from "@/lib/current-admin";
import { kronorToOre } from "@/lib/money-input";
import { formatOre } from "@/lib/format";
import { computeBundleAvailability, expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import { getOrderLineComponentsByLine } from "@/lib/orders/line-components";
import { resolveCartLine } from "@/lib/queries/cart";
import {
  KustomApiError,
  cancelOrder,
  captureOrder,
  getOrderManagementOrder,
  refundOrder,
} from "@/lib/kustom/client";
import { markOrderShipped } from "@/lib/orders/mark-shipped";
import { captureOrderOnShipment } from "@/lib/orders/capture-on-shipment";
import { takeFromStock } from "@/lib/inventory/take-from-stock";
import { CLAIM_CAUSES, CLAIM_NOTE_PREFIX } from "@/lib/orders/claim-causes";
import { parseAddressForm } from "@/lib/orders/address-form";
import { buildOrderConfirmationInputFromDb } from "@/lib/orders/order-confirmation-input";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";

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

/**
 * Skickar orderbekräftelsen för en befintlig order till valfri adress -
 * t.ex. adressen mail-tester.com ger, för att få ett spampoäng med exakta
 * orsaker. Exakt samma mejl (ämne, innehåll, avsändare) som kunden fick,
 * så resultatet gäller de riktiga mejlen. Kunden får ingenting.
 */
export async function sendTestOrderEmailAction(orderId: string, formData: FormData) {
  await requireCurrentAdmin();
  const to = formData.get("to")?.toString().trim() ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ange en giltig e-postadress.")}#testmejl`);
  }

  let errorMessage: string | null = null;
  try {
    const input = await buildOrderConfirmationInputFromDb(orderId, to);
    if (!input) {
      errorMessage = "Ordern hittades inte.";
    } else {
      await sendOrderConfirmationEmail(input);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Kunde inte skicka testmejlet.";
  }

  if (errorMessage) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(errorMessage)}#testmejl`);
  }
  redirect(`/orders/${orderId}?testEmailSent=${encodeURIComponent(to)}#testmejl`);
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
          line.id,
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Flyttar en orders lagerpåverkan på EN uppsättning lagerrader - används
 * när en vara på ordern byts (editOrderLineAction/swapLineComponentAction).
 * `direction: "out"` = den gamla varan, `"in"` = den nya.
 *
 * - Ej skickad order: reserverat flyttas (order_released/order_reserved),
 *   precis som tidigare.
 * - Skickad order (rättelse i efterhand, t.ex. en kund som ändrade sig men
 *   bytet aldrig registrerades innan paketet gick): SKICKAT flyttas i
 *   stället - den gamla varan har aldrig lämnat lagret, den nya har det.
 *   Loggas som order_shipped (negativt för den gamla). "I lager"
 *   (quantity) rörs aldrig, precis som vid vanlig leverans.
 */
async function moveOrderInventory(
  tx: Tx,
  targets: { productId: string; variantId: string | null; quantity: number }[],
  direction: "out" | "in",
  shipped: boolean,
  orderId: string,
  noteFor: (target: { productId: string }) => string,
) {
  const sign = direction === "out" ? -1 : 1;
  for (const target of targets) {
    const condition = target.variantId
      ? and(
          eq(schema.inventory.productId, target.productId),
          eq(schema.inventory.variantId, target.variantId),
        )
      : and(eq(schema.inventory.productId, target.productId), isNull(schema.inventory.variantId));

    const [inventoryRow] = await tx
      .select({ id: schema.inventory.id })
      .from(schema.inventory)
      .where(condition);
    if (!inventoryRow) continue;

    const delta = sign * target.quantity;
    await tx
      .update(schema.inventory)
      .set(
        shipped
          ? { shippedQuantity: sql`${schema.inventory.shippedQuantity} + ${delta}`, updatedAt: new Date() }
          : { reservedQuantity: sql`${schema.inventory.reservedQuantity} + ${delta}`, updatedAt: new Date() },
      )
      .where(eq(schema.inventory.id, inventoryRow.id));

    await tx.insert(schema.inventoryMovements).values({
      inventoryId: inventoryRow.id,
      changeAmount: delta,
      reason: shipped ? "order_shipped" : direction === "out" ? "order_released" : "order_reserved",
      orderId,
      note: noteFor(target),
    });
  }
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
 * Tillåtet även på en skickad order (rättelse i efterhand) - då flyttas
 * "skickat" i stället för "reserverat", se moveOrderInventory. Inte på en
 * avbruten order.
 */
export async function editOrderLineAction(orderId: string, lineId: string, formData: FormData) {
  await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  if (order.fulfillmentStatus === "cancelled") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Ordern är avbruten - går inte att ändra.")}`,
    );
  }
  const shipped = order.fulfillmentStatus === "shipped";

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
  // Lagerkollen gäller bara innan leverans - för en skickad order har den
  // nya varan redan fysiskt lämnat lagret, oavsett vad systemet trodde.
  if (!shipped && newResolved.available < line.quantity) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(
        `Inte tillräckligt i lager av "${newSku}" (${newResolved.available} tillgängligt, behöver ${line.quantity}).`,
      )}`,
    );
  }

  const newName = order.locale === "en-SE" ? newResolved.nameEn : newResolved.nameSv;

  const verbOut = shipped ? "Rättelse efter leverans: skickades inte" : "Reservation släppt";
  const verbIn = shipped ? "Rättelse efter leverans: skickades" : "Reserverat";

  await db.transaction(async (tx) => {
    const releaseTargets = await expandLineToInventoryTargets(
      tx,
      oldResolved.productId,
      oldResolved.variantId,
      line.quantity,
      line.id,
    );
    await moveOrderInventory(tx, releaseTargets, "out", shipped, orderId, (target) =>
      target.productId === oldResolved.productId
        ? `${verbOut}: bytt till "${newSku}"`
        : `${verbOut}: bytt till "${newSku}" (komponent i "${oldResolved.nameSv}")`,
    );

    const reserveTargets = await expandLineToInventoryTargets(
      tx,
      newResolved.productId,
      newResolved.variantId,
      line.quantity,
    );
    await moveOrderInventory(tx, reserveTargets, "in", shipped, orderId, (target) =>
      target.productId === newResolved.productId
        ? `${verbIn}: bytt från "${line.reference}"`
        : `${verbIn}: bytt från "${line.reference}" (komponent i "${newResolved.nameSv}")`,
    );

    await tx
      .update(schema.orderLines)
      .set({ productId: newResolved.productId, reference: newSku, name: newName })
      .where(eq(schema.orderLines.id, lineId));

    // Ev. tidigare komponent-substitutioner (swapLineComponentAction)
    // pekade på "platser" i DEN GAMLA SKU:ns kit-recept - meningslösa nu
    // när hela raden pekar på en annan SKU.
    await tx
      .delete(schema.orderLineComponentSwaps)
      .where(eq(schema.orderLineComponentSwaps.orderLineId, lineId));
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * Byter EN komponent inuti en kit-orderrad - t.ex. helböna i stället
 * för malet i ett redan köpt Komplett Kit. Till skillnad från
 * editOrderLineAction (som byter hela raden, bara vid samma pris)
 * ändras INGENTING på orderraden själv (kitets SKU/pris/summa) - bara
 * vilken lagervara som reserveras för just den komponent-"platsen", för
 * den här ordern (sparas i order_line_component_swaps). Inget priskrav:
 * kunden betalade för HELA kitet, inte för den enskilda komponenten.
 * Tillåtet även på en skickad order (rättelse i efterhand), precis som
 * editOrderLineAction - se moveOrderInventory.
 */
export async function swapLineComponentAction(
  orderId: string,
  lineId: string,
  formData: FormData,
) {
  await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  if (order.fulfillmentStatus === "cancelled") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Ordern är avbruten - går inte att ändra.")}`,
    );
  }
  const shipped = order.fulfillmentStatus === "shipped";

  const [line] = await db
    .select()
    .from(schema.orderLines)
    .where(and(eq(schema.orderLines.id, lineId), eq(schema.orderLines.orderId, orderId)));
  if (!line || line.type !== "physical") {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Orderraden hittades inte.")}`);
  }

  const originalComponentProductId = formData.get("originalComponentProductId")?.toString();
  const newSku = formData.get("newSku")?.toString().trim();
  if (!originalComponentProductId || !newSku) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ange en vara att byta till.")}`);
  }

  const componentsByLine = await getOrderLineComponentsByLine([
    { id: line.id, reference: line.reference, quantity: line.quantity },
  ]);
  const current = (componentsByLine.get(line.id) ?? []).find(
    (component) => component.originalComponentProductId === originalComponentProductId,
  );
  if (!current) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Komponenten hittades inte.")}`);
  }

  const newResolved = await resolveCartLine(newSku, { requirePublished: true });
  if (!newResolved) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(`"${newSku}" hittades inte eller är inte publicerad.`)}`,
    );
  }
  if (newResolved.productId === current.productId && newResolved.variantId === current.variantId) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Redan samma vara.")}`);
  }
  if ((await computeBundleAvailability(db, newResolved.productId)) !== null) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Kan inte byta till ett annat kit som komponent.")}`,
    );
  }
  if (!shipped && newResolved.available < current.quantity) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(
        `Inte tillräckligt i lager av "${newSku}" (${newResolved.available} tillgängligt, behöver ${current.quantity}).`,
      )}`,
    );
  }

  const verbOut = shipped ? "Rättelse efter leverans: skickades inte" : "Reservation släppt";
  const verbIn = shipped ? "Rättelse efter leverans: skickades" : "Reserverat";

  await db.transaction(async (tx) => {
    await moveOrderInventory(
      tx,
      [{ productId: current.productId, variantId: current.variantId, quantity: current.quantity }],
      "out",
      shipped,
      orderId,
      () => `${verbOut}: kit-komponent bytt till "${newSku}" (komponent i "${line.name}")`,
    );
    await moveOrderInventory(
      tx,
      [{ productId: newResolved.productId, variantId: newResolved.variantId, quantity: current.quantity }],
      "in",
      shipped,
      orderId,
      () => `${verbIn}: kit-komponent bytt från annan vara (komponent i "${line.name}")`,
    );

    await tx
      .insert(schema.orderLineComponentSwaps)
      .values({
        orderLineId: line.id,
        originalComponentProductId,
        newProductId: newResolved.productId,
        newVariantId: newResolved.variantId,
      })
      .onConflictDoUpdate({
        target: [
          schema.orderLineComponentSwaps.orderLineId,
          schema.orderLineComponentSwaps.originalComponentProductId,
        ],
        set: {
          newProductId: newResolved.productId,
          newVariantId: newResolved.variantId,
          createdAt: new Date(),
        },
      });
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * Rättar leverans- eller fakturaadressen på en order i VÅR databas - t.ex.
 * när kunden skrivit fel. Plocklista, PostNord-export och postnummerkollen
 * i PostNord-synken läser därefter den rättade adressen. Ändrar INTE
 * adressen hos Kustom eller en fraktsedel som redan skapats hos PostNord
 * (den får rättas i PostNords portal). Kustom-omläsningen
 * (persistOrderFromKustom) skriver aldrig över adresserna, så rättelsen
 * ligger kvar. Gammal och ny adress loggas i audit_log (syns under Loggar).
 */
export async function updateOrderAddressAction(
  orderId: string,
  kind: "shipping" | "billing",
  formData: FormData,
) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);
  const before = kind === "shipping" ? order.shippingAddress : order.billingAddress;

  const parsed = parseAddressForm((field) => formData.get(field)?.toString(), before);
  if (!parsed.ok) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(parsed.error)}#adresser`);
  }

  await db
    .update(schema.orders)
    .set(
      kind === "shipping"
        ? { shippingAddress: parsed.address, updatedAt: new Date() }
        : { billingAddress: parsed.address, updatedAt: new Date() },
    )
    .where(eq(schema.orders.id, orderId));

  await db.insert(schema.auditLog).values({
    actorEmail: admin.email,
    actorUserId: admin.userId,
    action: kind === "shipping" ? "order.shipping_address_updated" : "order.billing_address_updated",
    targetType: "order",
    targetId: String(order.orderNumber),
    metadata: { before, after: parsed.address },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?addressUpdated=${kind}#adresser`);
}

/**
 * Registrerar en reklamation: en ersättningsvara skickad till kunden utan
 * kostnad (t.ex. ett trasigt phin-filter som ersätts med ett nytt). Drar
 * varan från "I lager" via takeFromStock (samma som eget uttag, kit dras
 * från sina komponenter) och kopplar lagerrörelsen till ordern, så den syns
 * under "Reklamationer" på ordern och räknas på kunden. Orsak + kommentar
 * (och ev. spårningsnummer för ersättningspaketet) sparas i anteckningen.
 * Rör inte betalningen - en ev. återbetalning görs separat. Den trasiga
 * varan läggs INTE tillbaka i lager; skickar kunden tillbaka något som går
 * att sälja igen, registrera det som retur.
 */
export async function registerClaimAction(orderId: string, formData: FormData) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  const inventoryId = formData.get("inventoryId")?.toString() ?? "";
  const quantity = Number(formData.get("quantity"));
  const causeKey = formData.get("cause")?.toString() ?? "";
  const comment = formData.get("comment")?.toString().trim() ?? "";
  const trackingNumber = formData.get("trackingNumber")?.toString().trim() || null;

  const fail = (message: string) =>
    redirect(`/orders/${orderId}?error=${encodeURIComponent(message)}#reklamationer`);

  if (!inventoryId) fail("Välj vilken vara som skickas som ersättning.");
  if (!Number.isInteger(quantity) || quantity <= 0) fail("Ange ett antal större än 0.");
  if (!(causeKey in CLAIM_CAUSES)) fail("Välj en orsak.");
  if (!comment) fail("Skriv en kommentar om varför.");

  const cause = CLAIM_CAUSES[causeKey as keyof typeof CLAIM_CAUSES];
  const note = `${CLAIM_NOTE_PREFIX} (${cause}): ${comment}${
    trackingNumber ? ` - ersättning skickad, spårning ${trackingNumber}` : ""
  }`;

  await db
    .transaction(async (tx) => {
      await takeFromStock(tx, { inventoryId, quantity, note, adminId: admin.id, orderId: order.id });
    })
    .catch((err) => {
      fail(err instanceof Error ? err.message : "Något gick fel.");
    });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/customers");
  redirect(`/orders/${orderId}?claimRegistered=1#reklamationer`);
}

/**
 * Registrerar en (eventuellt partiell) retur av EN komponent från en
 * skickad order - t.ex. bara kaffet från ett kit, inte phin-filtret
 * eller mjölken. Lägger tillbaka antalet i "I lager" (quantity) direkt -
 * rör INTE reservedQuantity/shippedQuantity (de är kumulativa "totalt
 * genom tiderna"-räknare, se schema/catalog.ts - en retur är en NY
 * leverans-händelse, inte en ångring av leveransen). Samma `reason:
 * "return"` som redan fanns reserverad i inventory_movement_reason men
 * inte användes förrän nu. Hänger INTE ihop med återbetalning - det
 * gör ni separat via Återbetala-knapparna, som idag.
 */
export async function returnLineComponentAction(
  orderId: string,
  lineId: string,
  formData: FormData,
) {
  const admin = await requireCurrentAdmin();
  const order = await getOrderOrRedirect(orderId);

  if (order.fulfillmentStatus !== "shipped") {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Bara skickade ordrar kan få en retur registrerad.")}`,
    );
  }

  const [line] = await db
    .select()
    .from(schema.orderLines)
    .where(and(eq(schema.orderLines.id, lineId), eq(schema.orderLines.orderId, orderId)));
  if (!line || line.type !== "physical") {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Orderraden hittades inte.")}`);
  }

  const originalComponentProductId = formData.get("originalComponentProductId")?.toString();
  const quantity = Number(formData.get("quantity"));
  if (!originalComponentProductId || !Number.isInteger(quantity) || quantity <= 0) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Ange ett giltigt antal att returnera.")}`);
  }

  const componentsByLine = await getOrderLineComponentsByLine([
    { id: line.id, reference: line.reference, quantity: line.quantity },
  ]);
  const current = (componentsByLine.get(line.id) ?? []).find(
    (component) => component.originalComponentProductId === originalComponentProductId,
  );
  if (!current) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Komponenten hittades inte.")}`);
  }

  const condition = current.variantId
    ? and(
        eq(schema.inventory.productId, current.productId),
        eq(schema.inventory.variantId, current.variantId),
      )
    : and(eq(schema.inventory.productId, current.productId), isNull(schema.inventory.variantId));

  const [inventoryRow] = await db
    .select({ id: schema.inventory.id })
    .from(schema.inventory)
    .where(condition);
  if (!inventoryRow) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent("Lagerraden hittades inte.")}`);
  }

  const previousReturns = await db
    .select({ changeAmount: schema.inventoryMovements.changeAmount })
    .from(schema.inventoryMovements)
    .where(
      and(
        eq(schema.inventoryMovements.inventoryId, inventoryRow.id),
        eq(schema.inventoryMovements.orderId, orderId),
        eq(schema.inventoryMovements.reason, "return"),
      ),
    );
  const alreadyReturned = previousReturns.reduce((sum, row) => sum + row.changeAmount, 0);
  const remaining = current.quantity - alreadyReturned;

  if (quantity > remaining) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(
        `Kan max returnera ${remaining} st (${alreadyReturned} redan registrerat av totalt ${current.quantity}).`,
      )}`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.inventory)
      .set({
        quantity: sql`${schema.inventory.quantity} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, inventoryRow.id));

    await tx.insert(schema.inventoryMovements).values({
      inventoryId: inventoryRow.id,
      changeAmount: quantity,
      reason: "return",
      orderId,
      causedByAdminId: admin.id,
      note: `Retur: order #${order.orderNumber} (${current.name}, komponent i "${line.name}")`,
    });
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

  const shipped = await markOrderShipped(orderId, carrier, trackingNumber);
  if (!shipped) {
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent("Ordern är redan skickad eller avbruten.")}`,
    );
  }

  // Debitera det som återstår direkt när ordern skickas (se
  // capture-on-shipment.ts). Ett fel här ångrar INTE att ordern är skickad
  // - paketet har ju gått - men visas, och bakgrundssynken försöker igen.
  let captureError: string | null = null;
  try {
    await captureOrderOnShipment(orderId);
  } catch (err) {
    captureError = `Ordern är markerad som skickad, men den automatiska debiteringen misslyckades: ${kustomErrorMessage(err)} Tryck "Debitera" under Betalning.`;
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  if (captureError) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(captureError)}`);
  }
  // handDelivered-flaggan låter sidan visa en påminnelse om att avboka
  // fraktsedeln hos PostNord manuellt (om en redan skapats där) - vi
  // skriver aldrig till PostNords system själva, se markLabelCreatedAction.
  redirect(
    `/orders/${orderId}?saved=1${carrier === "Levererad för hand" ? "&handDelivered=1" : ""}`,
  );
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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
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

/** Synkar vårt cachade belopp/status från Kustoms Order Management efter varje åtgärd — Kustom är alltid facit. */
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
  const rawAmount = formData.get("amount");
  const amountOre = rawAmount ? Number(rawAmount) : remaining;
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
  const amountOre = Number(formData.get("amount"));
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
    await db
      .update(schema.orders)
      .set({
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
        fulfillmentStatus: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, orderId));
    await db.insert(schema.orderEvents).values({
      orderId,
      type: "cancel",
      causedByAdminId: admin.id,
    });
  } catch (err) {
    redirect(`/orders/${orderId}?error=${encodeURIComponent(kustomErrorMessage(err))}`);
  }

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
      const resolved = await resolveCartLine(line.reference);
      if (!resolved) continue;

      const condition = resolved.variantId
        ? and(
            eq(schema.inventory.productId, resolved.productId),
            eq(schema.inventory.variantId, resolved.variantId),
          )
        : and(
            eq(schema.inventory.productId, resolved.productId),
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
          quantity: sql`${schema.inventory.quantity} - ${line.quantity}`,
          reservedQuantity: sql`${schema.inventory.reservedQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.inventory.id, inventoryRow.id));

      await tx.insert(schema.inventoryMovements).values({
        inventoryId: inventoryRow.id,
        changeAmount: -line.quantity,
        reason: "order_shipped",
        orderId,
        note: `Skickad: ${carrier} ${trackingNumber}`,
      });
    }
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}?saved=1`);
}

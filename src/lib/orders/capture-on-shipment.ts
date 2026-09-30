import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { captureOrder, getOrderManagementOrder } from "@/lib/kustom/client";

export type CaptureOnShipmentResult =
  | { captured: true; amountOre: number }
  | { captured: false; reason: "nothing_to_capture" };

/**
 * Debiterar det som återstår av en orders reservation när den markerats
 * som skickad - ägarens beslut 2026-09-30 ("så att vi inte behöver tänka på
 * det"). Gäller i praktiken betala senare-ordrar (Klarna faktura/
 * delbetalning, företagsfaktura): för dem skickas fakturan till kunden och
 * betalfristen börjar räknas först nu. Kort/Swish/Klarna betala nu och
 * förbeställningar är redan debiterade vid ordertillfället
 * (capture-at-checkout.ts), så där finns inget kvar och det blir en no-op.
 *
 * Utgår alltid från Kustoms FÄRSKA läge (remaining_authorized_amount,
 * status), inte vår cachade kopia - en reservation som släppts, en order
 * som annullerats eller redan debiterats i Kustoms portal debiteras aldrig
 * igen. Idempotensnyckeln är fast per order+belopp, så ett nytt försök
 * efter t.ex. en timeout aldrig kan dubbeldebitera.
 *
 * Kastar vid fel från Kustom (t.ex. en reservation som hunnit gå ut) -
 * anroparen avgör hur det visas.
 */
export async function captureOrderOnShipment(orderId: string): Promise<CaptureOnShipmentResult> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order || order.isTest) return { captured: false, reason: "nothing_to_capture" };

  const fresh = await getOrderManagementOrder(order.kustomOrderId);
  const remaining = fresh.remaining_authorized_amount;
  const capturable = fresh.status === "AUTHORIZED" || fresh.status === "PART_CAPTURED";

  if (capturable && remaining > 0) {
    await captureOrder(
      order.kustomOrderId,
      { captured_amount: remaining, description: "Skickad" },
      `ship-capture-${order.kustomOrderId}-${remaining}`,
    );
  }

  const after = capturable && remaining > 0 ? await getOrderManagementOrder(order.kustomOrderId) : fresh;
  await db
    .update(schema.orders)
    .set({
      capturedAmountOre: after.captured_amount,
      refundedAmountOre: after.refunded_amount,
      status: after.status,
      paymentStatus: after.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId));

  if (!capturable || remaining <= 0) return { captured: false, reason: "nothing_to_capture" };

  await db.insert(schema.orderEvents).values({
    orderId,
    type: "capture",
    amountOre: remaining,
    note: "Automatisk debitering: ordern skickad",
  });
  return { captured: true, amountOre: remaining };
}

/**
 * Debiterar skickade riktiga ordrar som fortfarande inte är färdig-
 * debiterade - t.ex. ordrar som markerats som skickade innan automatisk
 * debitering fanns, eller där debiteringen misslyckades tillfälligt (Kustom
 * nere). Körs i bakgrundssynken och den dagliga cron-körningen. Fel för en
 * order loggas och hindrar aldrig resten.
 */
export async function captureShippedButUncapturedOrders(): Promise<{ captured: number; failed: number }> {
  const uncaptured = await db
    .select({ id: schema.orders.id, orderNumber: schema.orders.orderNumber })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.fulfillmentStatus, "shipped"),
        eq(schema.orders.isTest, false),
        inArray(schema.orders.status, ["AUTHORIZED", "PART_CAPTURED"]),
      ),
    );

  let captured = 0;
  let failed = 0;
  for (const order of uncaptured) {
    try {
      if ((await captureOrderOnShipment(order.id)).captured) captured += 1;
    } catch (err) {
      failed += 1;
      console.error("Automatisk debitering misslyckades för order", order.orderNumber, err);
    }
  }
  return { captured, failed };
}

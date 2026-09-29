import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { captureOrder, getOrderManagementOrder } from "@/lib/kustom/client";

/**
 * Debiterar en order direkt vid ordertillfället, i stället för Klarnas
 * normala "debitera vid leverans". Används för:
 *
 * - förbeställningar - oavsett betalsätt, varan finns inte ens i lager
 *   än, så att vänta med debiteringen till leverans ger ingen mening.
 * - ordrar betalda med ett "betala nu"-sätt (kort, Apple/Google Pay,
 *   Swish m.m., se lib/kustom/payment-methods.ts) - ägarens beslut
 *   2026-09-29, eftersom de annars bara låg reserverade tills någon
 *   tryckte "Debitera" och riskerade att reservationen gick ut.
 *
 * Klarnas betala-senare-sätt (faktura, delbetalning) debiteras INTE här -
 * de ligger kvar reserverade och debiteras via "Debitera" på ordern.
 *
 * Använder aldrig `redirect()` - körs i push-hanterarens `after()` och
 * bekräftelsesidans anrop, inte i en formulärinlämning. Idempotensnyckeln
 * är fast per order, så ett nytt försök aldrig kan dubbeldebitera.
 */
export async function captureOrderAtCheckout(
  orderId: string,
  kustomOrderId: string,
  amountOre: number,
  reason: "preorder" | "pay_now",
) {
  const note =
    reason === "preorder"
      ? "Automatisk capture: förbeställning"
      : "Automatisk capture: betalt direkt (kort/Swish m.m.)";

  await captureOrder(
    kustomOrderId,
    {
      captured_amount: amountOre,
      description:
        reason === "preorder" ? "Förbeställning – capture direkt vid order" : "Capture direkt vid order",
    },
    `checkout-capture-${kustomOrderId}`,
  );

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

  await db.insert(schema.orderEvents).values({
    orderId,
    type: "capture",
    amountOre,
    note,
  });
}

import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { captureOrder, getOrderManagementOrder } from "@/lib/kustom/client";

/**
 * Preorder-ordrar captureas ALLTID direkt vid order, oavsett betalmetod.
 *
 * Det här är ett MEDVETET undantag från Klarnas normala mönster där
 * fakturaköp/delbetalning väntar med capture till fysisk leverans (se
 * captureOrderAction i orders/actions.ts, som lämnas helt orörd av det
 * här). Den senareläggningen finns för att skydda kunden vid KORT tid
 * till leverans — den ger ingen mening för en förbeställning där varan
 * inte ens finns i lager än. Ändra INTE detta till att vänta som
 * icke-preorder-ordrar utan att först stämma av med ägaren.
 *
 * Skiljer sig från captureOrderAction (som anropas från en Server Action
 * i adminet) genom att den ALDRIG använder `redirect()` — den körs i
 * push-hanterarens `after()`-callback (en Route Handler-kontext), inte i
 * en formulärinlämning.
 */
export async function capturePreorderOrder(
  orderId: string,
  kustomOrderId: string,
  amountOre: number,
) {
  await captureOrder(
    kustomOrderId,
    {
      captured_amount: amountOre,
      description: "Förbeställning – capture direkt vid order",
    },
    crypto.randomUUID(),
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
    note: "Automatisk capture: förbeställning",
  });
}

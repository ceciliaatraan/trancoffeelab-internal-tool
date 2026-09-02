import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acknowledgeOrder, getOrderManagementOrder } from "@/lib/kustom/client";
import { persistOrderFromKustom } from "@/lib/orders/persist-order";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";

/**
 * order_id kommer som query-parameter (bekräftat i AGENTS.md:s
 * merchant_urls.push-mall). Metoden (GET/POST) är INTE bekräftad mot
 * docs.kustom.co — POST antas i linje med validation-callbacken, se
 * docs/kustom.md.
 *
 * Vi litar ALDRIG på request-bodyn för orderdata — den läses alltid på
 * nytt från Kustom via getOrderManagementOrder. Bodyn loggas ändå rått
 * i webhook_events innan bearbetning, per spec.
 */
export async function POST(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order_id");
  const rawBody = await request.text();

  if (!orderId) {
    await db.insert(schema.webhookEvents).values({
      source: "kustom_push",
      kustomOrderId: null,
      rawPayload: { error: "missing order_id", body: rawBody },
      processed: false,
      processedAt: new Date(),
      errorMessage: "order_id saknades i push-anropet.",
    });
    return new NextResponse("Missing order_id", { status: 400 });
  }

  const [webhookEvent] = await db
    .insert(schema.webhookEvents)
    .values({
      source: "kustom_push",
      kustomOrderId: orderId,
      rawPayload: { body: rawBody || null },
      processed: false,
    })
    .returning({ id: schema.webhookEvents.id });

  after(async () => {
    try {
      const order = await getOrderManagementOrder(orderId);
      const persisted = await persistOrderFromKustom(order);

      if (!persisted.alreadyExisted) {
        await acknowledgeOrder(orderId, orderId);

        if (order.billing_address?.email) {
          await sendOrderConfirmationEmail({
            to: order.billing_address.email,
            locale: order.locale,
            orderNumber: persisted.orderNumber,
            totalOre: order.order_amount,
            lines: order.order_lines
              .filter((line) => (line.type ?? "physical") === "physical")
              .map((line) => ({ name: line.name, quantity: line.quantity })),
          });
        }
      }

      await db
        .update(schema.webhookEvents)
        .set({ processed: true, processedAt: new Date(), errorMessage: null })
        .where(eq(schema.webhookEvents.id, webhookEvent.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Okänt fel";
      console.error("Kunde inte bearbeta push för order", orderId, err);
      await db
        .update(schema.webhookEvents)
        .set({ processed: false, processedAt: new Date(), errorMessage: message })
        .where(eq(schema.webhookEvents.id, webhookEvent.id));
    }
  });

  return new NextResponse(null, { status: 200 });
}

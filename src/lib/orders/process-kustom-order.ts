import "server-only";
import { acknowledgeOrder, getOrderManagementOrder } from "@/lib/kustom/client";
import { persistOrderFromKustom, type PersistedOrder } from "@/lib/orders/persist-order";
import { capturePreorderOrder } from "@/lib/orders/capture-preorder";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { formatCustomerLabel, notifyNewOrderInSlack } from "@/lib/notifications/slack";

/**
 * Läser en order från Kustom och sparar/bekräftar/mejlar den - delad
 * mellan push-webhooken och bekräftelsesidans "eager"-anrop (se
 * confirmation/route.ts). persistOrderFromKustom är idempotent på
 * kustom_order_id, så det är säkert att kalla den här funktionen flera
 * gånger för samma order_id: andra och senare anrop ser bara
 * alreadyExisted=true och hoppar över bekräfta/capture/mejl.
 */
export async function processKustomOrder(orderId: string): Promise<PersistedOrder> {
  const order = await getOrderManagementOrder(orderId);
  const persisted = await persistOrderFromKustom(order);

  if (!persisted.alreadyExisted) {
    await acknowledgeOrder(orderId, orderId);

    // Preorder-ordrar captureas direkt, oavsett betalmetod - se den
    // förklarande kommentaren i capture-preorder.ts. Icke-preorder-
    // ordrar rörs INTE här; de captureas fortsatt manuellt via
    // "Debitera"-knappen i /orders/[id] (captureOrderAction).
    if (persisted.containsPreorder) {
      await capturePreorderOrder(persisted.id, orderId, order.order_amount);
    }

    if (order.billing_address?.email) {
      await sendOrderConfirmationEmail({
        to: order.billing_address.email,
        locale: order.locale,
        orderNumber: persisted.orderNumber,
        totalOre: order.order_amount,
        lines: persisted.physicalLines,
        shipping: persisted.shippingLine,
      });
    }

    const customer = formatCustomerLabel(
      order.billing_address?.given_name,
      order.billing_address?.family_name,
      order.billing_address?.email,
    );
    await notifyNewOrderInSlack(persisted, order.order_amount, customer);
  }

  return persisted;
}

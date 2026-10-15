import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  acknowledgeOrder,
  getOrderManagementOrder,
  readOrder,
  updateMerchantReferences,
} from "@/lib/kustom/client";
import { hasMarketingConsent } from "@/lib/kustom/marketing-consent";
import { persistOrderFromKustom, type PersistedOrder } from "@/lib/orders/persist-order";
import { captureOrderAtCheckout } from "@/lib/orders/capture-at-checkout";
import { isPayNowMethod } from "@/lib/kustom/payment-methods";
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

    // Vårt ordernummer som merchant_reference1 hos Kustom, om det inte redan
    // sattes i kassan (reserverat nummer, se reserve-order-number.ts) - så
    // numret alltid syns i Kustoms portal. Får aldrig stoppa resten.
    if (order.merchant_reference1 !== String(persisted.orderNumber)) {
      try {
        await updateMerchantReferences(
          orderId,
          { merchant_reference1: String(persisted.orderNumber) },
          `merchant-ref-${orderId}`,
        );
      } catch (err) {
        console.error("Kunde inte sätta ordernummer som merchant_reference1 hos Kustom", persisted.orderNumber, err);
      }
    }

    await saveMarketingConsent(orderId, order);

    // Förbeställningar (alla betalsätt) och "betala nu"-sätt (kort, Swish
    // m.m.) debiteras direkt - se capture-at-checkout.ts. Klarnas betala-
    // senare-sätt (faktura, delbetalning) och okända betalsätt rörs INTE
    // här; de debiteras manuellt via "Debitera" i /orders/[id].
    //
    // Ett fel vid debiteringen får inte stoppa orderbekräftelsemejlet/
    // Slack-notisen - felet kastas i stället EFTER dem, så push-anropet
    // ändå loggas som misslyckat i webhook_events (syns under Loggar) och
    // ordern ligger kvar som "Godkänd" för manuell debitering.
    let captureError: unknown = null;
    const payNow = isPayNowMethod(order.initial_payment_method?.type);
    if (persisted.containsPreorder || payNow) {
      try {
        await captureOrderAtCheckout(
          persisted.id,
          orderId,
          order.order_amount,
          persisted.containsPreorder ? "preorder" : "pay_now",
        );
      } catch (err) {
        captureError = err;
      }
    }

    if (order.billing_address?.email) {
      await sendOrderConfirmationEmail({
        to: order.billing_address.email,
        locale: order.locale,
        orderNumber: persisted.orderNumber,
        totalOre: order.order_amount,
        lines: persisted.physicalLines,
        shipping: persisted.shippingLine,
        business: persisted.businessName
          ? { name: persisted.businessName, vatNumber: persisted.businessVatNumber ?? "" }
          : null,
      });
    }

    const customer = formatCustomerLabel(
      order.billing_address?.given_name,
      order.billing_address?.family_name,
      order.billing_address?.email,
    );
    await notifyNewOrderInSlack(persisted, order.order_amount, customer);

    if (captureError) throw captureError;
  }

  return persisted;
}

/**
 * Kryssade kunden i nyhetsbrevsrutan i Kustoms kassa (se
 * marketing-consent.ts) sparas det som customers.marketing_consent.
 * Svaret (merchant_requested) finns i Klarna Checkout-modellens
 * Checkout-order, som Kustom bygger på - inte bekräftat för Kustom. Vi
 * kollar Order Management-ordern först och läser Checkout-ordern bara om
 * svaret inte fanns där. Ett tomt/nej-svar tar aldrig bort ett tidigare
 * samtycke, och ett fel här får aldrig stoppa resten av orderflödet.
 */
async function saveMarketingConsent(
  orderId: string,
  order: Awaited<ReturnType<typeof getOrderManagementOrder>>,
): Promise<void> {
  const email = order.billing_address?.email;
  if (!email) return;
  try {
    const consent = hasMarketingConsent(order) || hasMarketingConsent(await readOrder(orderId));
    if (!consent) return;
    await db
      .update(schema.customers)
      .set({ marketingConsent: true, updatedAt: new Date() })
      .where(eq(schema.customers.email, email));
  } catch (err) {
    console.error("Kunde inte läsa/spara nyhetsbrevssamtycket för order", orderId, err);
  }
}

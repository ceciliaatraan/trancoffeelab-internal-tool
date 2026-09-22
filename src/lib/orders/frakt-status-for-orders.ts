import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { PostnordApiError, trackPostnordShipment } from "@/lib/postnord/client";
import { resolveFraktStatus, type FraktStatus } from "@/lib/orders/fulfillment-status";

/**
 * Frakt-status (färg + text) för en uppsättning ordrar, med samma live
 * PostNord-koll som orderdetaljen - EN batchad fråga för skickningarna
 * oavsett hur många ordrar (inte en fråga per order). Delad av
 * /orders-listan och Dashboard-startsidans "Senaste ordrar", så de
 * aldrig kan råka visa olika saker för samma order (hände tidigare -
 * dashboarden visade bara statisk text medan /orders redan fått den
 * färgade badgen).
 */
export async function getFraktStatusByOrderId(
  orders: { id: string; fulfillmentStatus: string }[],
): Promise<Map<string, FraktStatus>> {
  const result = new Map<string, FraktStatus>();
  const shippedOrderIds = orders
    .filter((order) => order.fulfillmentStatus === "shipped")
    .map((order) => order.id);

  const latestShipmentCarrierByOrderId = new Map<string, string>();
  const postnordStatusByOrderId = new Map<string, string>();

  if (shippedOrderIds.length > 0) {
    const shipments = await db
      .select()
      .from(schema.shipments)
      .where(inArray(schema.shipments.orderId, shippedOrderIds))
      .orderBy(asc(schema.shipments.shippedAt));

    // Senaste skickningen per order "vinner" (sista i den asc-sorterade
    // listan skriver över) - normalfallet är en enda skickning per order.
    for (const shipment of shipments) {
      latestShipmentCarrierByOrderId.set(shipment.orderId, shipment.carrier);
    }

    await Promise.all(
      shipments
        .filter(
          (shipment) =>
            shipment.carrier.toLowerCase().includes("postnord") &&
            shipment.trackingNumber !== "(ingen spårning)",
        )
        .map(async (shipment) => {
          try {
            const tracking = await trackPostnordShipment(shipment.trackingNumber, "sv");
            if (tracking) {
              postnordStatusByOrderId.set(shipment.orderId, tracking.status);
            }
          } catch (err) {
            if (!(err instanceof PostnordApiError)) throw err;
            // Tyst - ordern faller tillbaka på "Skickad" nedan.
          }
        }),
    );
  }

  for (const order of orders) {
    result.set(
      order.id,
      resolveFraktStatus(
        order.fulfillmentStatus,
        latestShipmentCarrierByOrderId.get(order.id) ?? null,
        postnordStatusByOrderId.get(order.id) ?? null,
      ),
    );
  }

  return result;
}

import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolveCartLine } from "@/lib/queries/cart";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import type { orderFulfillmentStatusEnum } from "@/db/schema/orders";

type FulfillmentStatus = (typeof orderFulfillmentStatusEnum.enumValues)[number];

/**
 * Summerar bundle-expanderade kvantiteter för fysiska orderrader på
 * ordrar med en given fulfillment_status, per (produkt, variant) -
 * grunden för Reserverat (unfulfilled) och Skickat (shipped) nedan.
 * Facit hämtas alltid direkt från ordrarna själva i stället för att
 * lita på ackumulerade räknare (inventory.reserved_quantity) eller
 * rörelseloggar (inventory_movements), som båda kan hamna fel om en
 * enskild kod-väg missar att uppdateras (se markShippedAction/
 * cancelOrderAction-buggarna, 2026-09-21) - detta självläker alltid,
 * även för ordrar som drabbades INNAN de buggarna fixades. Nyckel:
 * `${productId}|${variantId ?? ""}`.
 */
async function sumOrderLineQuantitiesByFulfillmentStatus(
  fulfillmentStatus: FulfillmentStatus,
): Promise<Map<string, number>> {
  const lines = await db
    .select({
      reference: schema.orderLines.reference,
      quantity: schema.orderLines.quantity,
      type: schema.orderLines.type,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(eq(schema.orders.fulfillmentStatus, fulfillmentStatus));

  const totals = new Map<string, number>();

  for (const line of lines) {
    if (line.type !== "physical" || !line.reference) continue;
    const resolved = await resolveCartLine(line.reference, { requirePublished: false });
    if (!resolved) continue;

    const targets = await expandLineToInventoryTargets(
      db,
      resolved.productId,
      resolved.variantId,
      line.quantity,
    );

    for (const target of targets) {
      const key = `${target.productId}|${target.variantId ?? ""}`;
      totals.set(key, (totals.get(key) ?? 0) + target.quantity);
    }
  }

  return totals;
}

/** Verkligt reserverat lager per (produkt, variant) - ordrar som varken skickats eller avbokats. */
export function computeTrueReservedQuantities(): Promise<Map<string, number>> {
  return sumOrderLineQuantitiesByFulfillmentStatus("unfulfilled");
}

/** Verkligt skickat/levererat lager per (produkt, variant), totalt genom tiderna. */
export function computeTrueShippedQuantities(): Promise<Map<string, number>> {
  return sumOrderLineQuantitiesByFulfillmentStatus("shipped");
}

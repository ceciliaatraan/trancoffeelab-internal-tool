import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolveCartLine } from "@/lib/queries/cart";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";

/**
 * Räknar fram VERKLIGT reserverat lager per (produkt, variant), direkt
 * från öppna (fulfillment_status = unfulfilled) orderrader - i stället
 * för att lita på den ackumulerade reserved_quantity-kolumnen, som kan
 * hamna fel om en enskild kod-väg (leverans, avbokning) missar att
 * släppa sin reservation. Facit är alltid: summan av bundle-expanderade
 * kvantiteter för fysiska rader på ordrar som varken skickats eller
 * avbokats. Nyckel: `${productId}|${variantId ?? ""}`.
 */
export async function computeTrueReservedQuantities(): Promise<Map<string, number>> {
  const openLines = await db
    .select({
      reference: schema.orderLines.reference,
      quantity: schema.orderLines.quantity,
      type: schema.orderLines.type,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(eq(schema.orders.fulfillmentStatus, "unfulfilled"));

  const totals = new Map<string, number>();

  for (const line of openLines) {
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

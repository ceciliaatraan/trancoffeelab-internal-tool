import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAllBundleItems } from "@/lib/inventory/bundles";
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
 * även för ordrar som drabbades INNAN de buggarna fixades.
 *
 * VIKTIGT: allt SKU-uppslag och all kit-expansion görs här i ett par
 * batchade frågor (en produkt-fråga, en variant-fråga, en bundle-fråga),
 * INTE en fråga per orderrad - en tidigare version anropade
 * resolveCartLine/expandLineToInventoryTargets per rad, vilket var en
 * N+1-fälla som gjorde /inventory extremt långsam mot riktig orderhistorik
 * (fungerade obemärkt lokalt bara för att testdatabasen är i praktiken
 * tom). Motsvarar resolveCartLine({ requirePublished: false }) - hittar
 * produkten/varianten oavsett status, eftersom en order kan peka på en
 * produkt som avpublicerats i efterhand. Nyckel: `${productId}|${variantId ?? ""}`.
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

  const physicalLines = lines.filter(
    (line): line is typeof line & { reference: string } =>
      line.type === "physical" && !!line.reference,
  );

  const totals = new Map<string, number>();
  if (physicalLines.length === 0) return totals;

  const skus = [...new Set(physicalLines.map((line) => line.reference))];

  const [productRows, variantRows, bundleItems] = await Promise.all([
    db
      .select({ sku: schema.products.sku, productId: schema.products.id })
      .from(schema.products)
      .where(inArray(schema.products.sku, skus)),
    db
      .select({
        sku: schema.productVariants.sku,
        productId: schema.productVariants.productId,
        variantId: schema.productVariants.id,
      })
      .from(schema.productVariants)
      .where(inArray(schema.productVariants.sku, skus)),
    getAllBundleItems(db),
  ]);

  // Samma prioritet som resolveCartLine: produkt-SKU före variant-SKU.
  const resolvedBySku = new Map<string, { productId: string; variantId: string | null }>();
  for (const row of variantRows) {
    resolvedBySku.set(row.sku, { productId: row.productId, variantId: row.variantId });
  }
  for (const row of productRows) {
    resolvedBySku.set(row.sku, { productId: row.productId, variantId: null });
  }

  const bundlesByProductId = new Map<string, typeof bundleItems>();
  for (const item of bundleItems) {
    const list = bundlesByProductId.get(item.bundleProductId) ?? [];
    list.push(item);
    bundlesByProductId.set(item.bundleProductId, list);
  }

  for (const line of physicalLines) {
    const resolved = resolvedBySku.get(line.reference);
    if (!resolved) continue;

    if (resolved.variantId) {
      const key = `${resolved.productId}|${resolved.variantId}`;
      totals.set(key, (totals.get(key) ?? 0) + line.quantity);
      continue;
    }

    const components = bundlesByProductId.get(resolved.productId);
    if (!components || components.length === 0) {
      const key = `${resolved.productId}|`;
      totals.set(key, (totals.get(key) ?? 0) + line.quantity);
      continue;
    }

    for (const component of components) {
      const key = `${component.componentProductId}|${component.componentVariantId ?? ""}`;
      totals.set(key, (totals.get(key) ?? 0) + line.quantity * component.quantity);
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

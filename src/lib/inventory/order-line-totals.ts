import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAllBundleItems } from "@/lib/inventory/bundles";
import { getComponentSwapsForLines } from "@/lib/orders/component-swaps";
import type { orderFulfillmentStatusEnum } from "@/db/schema/orders";

type FulfillmentStatus = (typeof orderFulfillmentStatusEnum.enumValues)[number];

export type OrderLineTotals = {
  /**
   * Bundle-expanderat - en kit-rad sprids ut på sina komponenter (så
   * komponenternas EGNA reserverat/skickat inkluderar det som gått åt
   * via kit-köp). Detta är vad kassans/lagrets Tillgängligt-beräkning
   * (lib/queries/cart.ts, lib/inventory/bundles.ts) och de lagrade
   * reserved_quantity/shipped_quantity-kolumnerna ska stämma mot.
   */
  expanded: Map<string, number>;
  /**
   * OEXPANDERAT - hur många av just den SKU:n (t.ex. kitets EGEN SKU)
   * som beställts/skickats direkt, utan att spridas ut på komponenter.
   * Det är det här en kit-rad ska visa som sitt eget Reserverat/Skickat
   * på /inventory - kitet har inget eget lagersaldo, men VI VET
   * fortfarande hur många kit som faktiskt sålts, från samma ordrar.
   */
  direct: Map<string, number>;
};

/**
 * Summerar kvantiteter för fysiska orderrader på ordrar med en given
 * fulfillment_status, per (produkt, variant) - grunden för Reserverat
 * (unfulfilled) och Skickat (shipped) nedan. Facit hämtas alltid direkt
 * från ordrarna själva i stället för att lita på ackumulerade räknare
 * (inventory.reserved_quantity) eller rörelseloggar
 * (inventory_movements), som båda kan hamna fel om en enskild kod-väg
 * missar att uppdateras (se markShippedAction/cancelOrderAction-
 * buggarna, 2026-09-21) - detta självläker alltid, även för ordrar som
 * drabbades INNAN de buggarna fixades.
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
 *
 * Tillämpar även order_line_component_swaps (swapLineComponentAction) -
 * en kit-komponent som bytts ut för en specifik order (t.ex. helböna i
 * stället för malet) ska räknas mot den NYA varan, inte kitets
 * ursprungliga recept, annars läker "Synka lager" bort bytet.
 */
async function sumOrderLineQuantitiesByFulfillmentStatus(
  fulfillmentStatuses: FulfillmentStatus[],
): Promise<OrderLineTotals> {
  const lines = await db
    .select({
      id: schema.orderLines.id,
      reference: schema.orderLines.reference,
      quantity: schema.orderLines.quantity,
      type: schema.orderLines.type,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(inArray(schema.orders.fulfillmentStatus, fulfillmentStatuses));

  const physicalLines = lines.filter(
    (line): line is typeof line & { reference: string } =>
      line.type === "physical" && !!line.reference,
  );

  const expanded = new Map<string, number>();
  const direct = new Map<string, number>();
  if (physicalLines.length === 0) return { expanded, direct };

  const skus = [...new Set(physicalLines.map((line) => line.reference))];

  const [productRows, variantRows, bundleItems, componentSwapsByLine] = await Promise.all([
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
    getComponentSwapsForLines(
      db,
      physicalLines.map((line) => line.id),
    ),
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

    const directKey = `${resolved.productId}|${resolved.variantId ?? ""}`;
    direct.set(directKey, (direct.get(directKey) ?? 0) + line.quantity);

    if (resolved.variantId) {
      expanded.set(directKey, (expanded.get(directKey) ?? 0) + line.quantity);
      continue;
    }

    const components = bundlesByProductId.get(resolved.productId);
    if (!components || components.length === 0) {
      expanded.set(directKey, (expanded.get(directKey) ?? 0) + line.quantity);
      continue;
    }

    const overridesForLine = componentSwapsByLine.get(line.id);
    for (const component of components) {
      const override = overridesForLine?.get(component.componentProductId);
      const key = override
        ? `${override.productId}|${override.variantId ?? ""}`
        : `${component.componentProductId}|${component.componentVariantId ?? ""}`;
      expanded.set(key, (expanded.get(key) ?? 0) + line.quantity * component.quantity);
    }
  }

  return { expanded, direct };
}

/**
 * Verkligt reserverat lager per (produkt, variant) - ordrar som varken
 * skickats eller avbokats. Inkluderar "label_created" (fraktsedel skapad
 * hos PostNord, men paketet inte lämnat/hämtat än) - fortfarande
 * reserverat, inte skickat.
 */
export function computeTrueReservedQuantities(): Promise<OrderLineTotals> {
  return sumOrderLineQuantitiesByFulfillmentStatus(["unfulfilled", "label_created"]);
}

/** Verkligt skickat/levererat lager per (produkt, variant), totalt genom tiderna. */
export function computeTrueShippedQuantities(): Promise<OrderLineTotals> {
  return sumOrderLineQuantitiesByFulfillmentStatus(["shipped"]);
}

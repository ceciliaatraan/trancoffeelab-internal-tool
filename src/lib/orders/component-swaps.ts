import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ComponentSwapTarget = { productId: string; variantId: string | null };

/**
 * Aktiva komponent-substitutioner (se schema/orders.ts:
 * order_line_component_swaps) för en uppsättning orderrader, grupperat
 * per orderrad och sedan per "plats i kitet" (originalComponentProductId).
 * EN batchad fråga oavsett hur många orderrader - samma "aldrig N+1"-
 * princip som order-line-totals.ts.
 */
export async function getComponentSwapsForLines(
  dbOrTx: DbOrTx,
  orderLineIds: string[],
): Promise<Map<string, Map<string, ComponentSwapTarget>>> {
  const result = new Map<string, Map<string, ComponentSwapTarget>>();
  if (orderLineIds.length === 0) return result;

  const rows = await dbOrTx
    .select({
      orderLineId: schema.orderLineComponentSwaps.orderLineId,
      originalComponentProductId: schema.orderLineComponentSwaps.originalComponentProductId,
      newProductId: schema.orderLineComponentSwaps.newProductId,
      newVariantId: schema.orderLineComponentSwaps.newVariantId,
    })
    .from(schema.orderLineComponentSwaps)
    .where(inArray(schema.orderLineComponentSwaps.orderLineId, orderLineIds));

  for (const row of rows) {
    const byLine = result.get(row.orderLineId) ?? new Map<string, ComponentSwapTarget>();
    byLine.set(row.originalComponentProductId, {
      productId: row.newProductId,
      variantId: row.newVariantId,
    });
    result.set(row.orderLineId, byLine);
  }
  return result;
}

/** Samma som getComponentSwapsForLines, för EN orderrad. */
export async function getComponentSwapsForLine(
  dbOrTx: DbOrTx,
  orderLineId: string,
): Promise<Map<string, ComponentSwapTarget>> {
  const map = await getComponentSwapsForLines(dbOrTx, [orderLineId]);
  return map.get(orderLineId) ?? new Map();
}

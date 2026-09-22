import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAllBundleItems } from "@/lib/inventory/bundles";
import { getComponentSwapsForLines } from "@/lib/orders/component-swaps";
import { resolveCartLine } from "@/lib/queries/cart";

export type OrderLineComponent = {
  /**
   * "Platsen" i kitets recept (product_bundle_items.component_product_id)
   * - stabil identifierare för byt/retur-formulären, oavsett om
   * produkten som faktiskt sitter där just nu har bytts ut.
   */
  originalComponentProductId: string;
  /** Vad som FAKTISKT gäller för den här ordern just nu (efter ev. byte). */
  productId: string;
  variantId: string | null;
  name: string;
  /** Antal FÖR HELA ORDERRADEN (kvantitet per kit × antal beställda kit). */
  quantity: number;
  isSwapped: boolean;
};

type LineInput = { id: string; reference: string; quantity: number };

/**
 * Bryter ner varje orderrad till dess "komponenter" - för en vanlig rad
 * (ingen kit) blir det en enda komponent (raden själv). För en kit-rad
 * blir det en rad per receptkomponent, med ev. per-order-substitution
 * (order_line_component_swaps) tillämpad. Används för visning på
 * orderdetaljen (byt komponent / partiell retur) - INTE för
 * lagerjustering, se expandLineToInventoryTargets (bundles.ts) och
 * computeTrueReservedQuantities (order-line-totals.ts) för det.
 *
 * En batch oavsett antal rader (samma "aldrig N+1"-princip som
 * order-line-totals.ts) - en order har typiskt bara ett fåtal rader.
 */
export async function getOrderLineComponentsByLine(
  lines: LineInput[],
): Promise<Map<string, OrderLineComponent[]>> {
  const result = new Map<string, OrderLineComponent[]>();
  if (lines.length === 0) return result;

  const [resolutions, bundleItems, swapsByLine] = await Promise.all([
    Promise.all(
      lines.map((line) => resolveCartLine(line.reference, { requirePublished: false })),
    ),
    getAllBundleItems(db),
    getComponentSwapsForLines(
      db,
      lines.map((line) => line.id),
    ),
  ]);

  const bundlesByProductId = new Map<string, typeof bundleItems>();
  for (const item of bundleItems) {
    const list = bundlesByProductId.get(item.bundleProductId) ?? [];
    list.push(item);
    bundlesByProductId.set(item.bundleProductId, list);
  }

  // Samla ALLA produkt/variant-id:n vars namn behövs - receptets egna
  // komponenter OCH ev. bytta mål - för EN batchad namnuppslagning.
  const neededProductIds = new Set<string>();
  const neededVariantIds = new Set<string>();
  const collectNeeded = (productId: string, variantId: string | null) => {
    neededProductIds.add(productId);
    if (variantId) neededVariantIds.add(variantId);
  };

  for (let i = 0; i < lines.length; i++) {
    const resolved = resolutions[i];
    if (!resolved) continue;
    const components = resolved.variantId ? null : bundlesByProductId.get(resolved.productId);
    if (!components || components.length === 0) continue;

    const overridesForLine = swapsByLine.get(lines[i].id);
    for (const component of components) {
      const override = overridesForLine?.get(component.componentProductId);
      if (override) {
        collectNeeded(override.productId, override.variantId);
      } else {
        collectNeeded(component.componentProductId, component.componentVariantId);
      }
    }
  }

  const [productNameRows, variantNameRows] = await Promise.all([
    neededProductIds.size > 0
      ? db
          .select({ id: schema.products.id, nameSv: schema.products.nameSv })
          .from(schema.products)
          .where(inArray(schema.products.id, [...neededProductIds]))
      : Promise.resolve([]),
    neededVariantIds.size > 0
      ? db
          .select({
            id: schema.productVariants.id,
            nameSv: schema.productVariants.nameSv,
            productId: schema.productVariants.productId,
          })
          .from(schema.productVariants)
          .where(inArray(schema.productVariants.id, [...neededVariantIds]))
      : Promise.resolve([]),
  ]);

  const productNameById = new Map(productNameRows.map((row) => [row.id, row.nameSv]));
  const variantNameById = new Map(
    variantNameRows.map((row) => [row.id, { nameSv: row.nameSv, productId: row.productId }]),
  );

  const nameFor = (productId: string, variantId: string | null): string => {
    const productName = productNameById.get(productId) ?? "Okänd produkt";
    if (!variantId) return productName;
    const variant = variantNameById.get(variantId);
    return variant ? `${productName} - ${variant.nameSv}` : productName;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const resolved = resolutions[i];
    if (!resolved) {
      result.set(line.id, []);
      continue;
    }

    const components = resolved.variantId ? null : bundlesByProductId.get(resolved.productId);
    if (!components || components.length === 0) {
      result.set(line.id, [
        {
          originalComponentProductId: resolved.productId,
          productId: resolved.productId,
          variantId: resolved.variantId,
          name: resolved.nameSv,
          quantity: line.quantity,
          isSwapped: false,
        },
      ]);
      continue;
    }

    const overridesForLine = swapsByLine.get(line.id);
    result.set(
      line.id,
      components.map((component) => {
        const override = overridesForLine?.get(component.componentProductId);
        const productId = override?.productId ?? component.componentProductId;
        const variantId = override ? override.variantId : component.componentVariantId;
        return {
          originalComponentProductId: component.componentProductId,
          productId,
          variantId,
          name: nameFor(productId, variantId),
          quantity: line.quantity * component.quantity,
          isSwapped: Boolean(override),
        };
      }),
    );
  }

  return result;
}

export type DiscountAppliesTo = "products" | "shipping" | "both";

/**
 * Splits a discount's value across the products/shipping bases it applies
 * to. Not from Kustom's documentation - our own design decision (see
 * db/schema/discounts.ts's discountAppliesToEnum comment):
 *
 * - percentage: the same rate applied to each base independently (so a
 *   100% "both" code zeroes products AND shipping, not just whichever is
 *   larger).
 * - fixed: a flat amount doesn't split proportionally on its own, so we
 *   take it off products first and only spill any remainder onto
 *   shipping - simplest rule that still can't discount more than the
 *   order actually costs.
 *
 * Either base being irrelevant to the scope (e.g. shippingOre when
 * appliesTo is "products") is treated as 0, so that portion is always 0.
 *
 * Pure - no DB/server-only import, so it's testable without DATABASE_URL
 * (same split as day-buckets.ts/stats.ts for the dashboard).
 */
export function computeDiscountSplit(
  type: "percentage" | "fixed",
  value: number,
  appliesTo: DiscountAppliesTo,
  subtotalOre: number,
  shippingOre: number,
): { productsDiscountOre: number; shippingDiscountOre: number } {
  const productsBase = appliesTo === "shipping" ? 0 : subtotalOre;
  const shippingBase = appliesTo === "products" ? 0 : shippingOre;

  if (type === "percentage") {
    return {
      productsDiscountOre: Math.round((productsBase * value) / 10000),
      shippingDiscountOre: Math.round((shippingBase * value) / 10000),
    };
  }

  const productsDiscountOre = Math.min(value, productsBase);
  const shippingDiscountOre = Math.min(value - productsDiscountOre, shippingBase);
  return { productsDiscountOre, shippingDiscountOre };
}

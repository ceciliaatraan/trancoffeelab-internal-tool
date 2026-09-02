import "server-only";
import type { CartRequest } from "@/lib/validation/cart";
import { evaluateDiscountCode } from "@/lib/discounts";
import { resolveCartLine } from "./cart";

export type ValidatedCartItem = {
  sku: string;
  nameSv: string;
  nameEn: string;
  quantity: number;
  unitPriceOre: number;
  taxRate: number;
  available: boolean;
  maxAvailable: number;
  productId: string | null;
  variantId: string | null;
};

export type ValidatedCartDiscount =
  | { code: string; valid: true; type: "percentage" | "fixed"; amountOre: number }
  | { code: string; valid: false; reason: string };

export type ValidatedCart = {
  items: ValidatedCartItem[];
  /** Alla rader hittades och finns i tillräcklig mängd. */
  valid: boolean;
  subtotalOre: number;
  discount: ValidatedCartDiscount | null;
};

/**
 * Enda källan till varukorgsvalidering — används av både
 * /api/public/cart/validate och /api/public/checkout/session så de
 * aldrig kan komma fram till olika priser eller lagerbesked.
 */
export async function buildValidatedCart(request: CartRequest): Promise<ValidatedCart> {
  const items: ValidatedCartItem[] = [];

  for (const line of request.items) {
    const resolved = await resolveCartLine(line.sku);

    if (!resolved) {
      items.push({
        sku: line.sku,
        nameSv: line.sku,
        nameEn: line.sku,
        quantity: line.quantity,
        unitPriceOre: 0,
        taxRate: 0,
        available: false,
        maxAvailable: 0,
        productId: null,
        variantId: null,
      });
      continue;
    }

    items.push({
      sku: resolved.sku,
      nameSv: resolved.nameSv,
      nameEn: resolved.nameEn,
      quantity: line.quantity,
      unitPriceOre: resolved.priceOre,
      taxRate: resolved.taxRate,
      available: resolved.available >= line.quantity,
      maxAvailable: resolved.available,
      productId: resolved.productId,
      variantId: resolved.variantId,
    });
  }

  const valid = items.length > 0 && items.every((item) => item.available);
  const subtotalOre = items.reduce((sum, item) => sum + item.unitPriceOre * item.quantity, 0);

  let discount: ValidatedCart["discount"] = null;
  if (request.discountCode) {
    const evaluation = await evaluateDiscountCode(request.discountCode, subtotalOre);
    discount = evaluation.valid
      ? { code: evaluation.code, valid: true, type: evaluation.type, amountOre: evaluation.amountOre }
      : { code: request.discountCode, valid: false, reason: evaluation.reason };
  }

  return { items, valid, subtotalOre, discount };
}

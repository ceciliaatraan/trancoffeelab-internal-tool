import "server-only";
import type { CartRequest } from "@/lib/validation/cart";
import { evaluateDiscountCode, type DiscountAppliesTo } from "@/lib/discounts";
import { getShopSettings } from "@/lib/settings";
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
  /** Visas i checkout-sammanfattningen: "Beräknad leverans: ‹expectedShipDate›". */
  isPreorder: boolean;
  expectedShipDate: string | null;
};

export type ValidatedCartDiscount =
  | {
      code: string;
      valid: true;
      type: "percentage" | "fixed";
      appliesTo: DiscountAppliesTo;
      amountOre: number;
      productsDiscountOre: number;
      shippingDiscountOre: number;
    }
  | { code: string; valid: false; reason: string };

export type ValidatedCart = {
  items: ValidatedCartItem[];
  /** Alla rader hittades och finns i tillräcklig mängd. */
  valid: boolean;
  subtotalOre: number;
  /** 0 om fri frakt gäller (se freeShipping) — annars shop_settings flatrate. */
  shippingOre: number;
  freeShipping: boolean;
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
        isPreorder: false,
        expectedShipDate: null,
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
      isPreorder: resolved.isPreorder,
      expectedShipDate: resolved.expectedShipDate,
    });
  }

  const valid = items.length > 0 && items.every((item) => item.available);
  const subtotalOre = items.reduce((sum, item) => sum + item.unitPriceOre * item.quantity, 0);

  const shopSettings = await getShopSettings();
  const freeShipping =
    shopSettings.freeShippingThresholdOre !== null &&
    subtotalOre >= shopSettings.freeShippingThresholdOre;
  const shippingOre = freeShipping ? 0 : shopSettings.shippingFlatRateOre;

  let discount: ValidatedCart["discount"] = null;
  if (request.discountCode) {
    const evaluation = await evaluateDiscountCode(request.discountCode, subtotalOre, shippingOre);
    discount = evaluation.valid
      ? {
          code: evaluation.code,
          valid: true,
          type: evaluation.type,
          appliesTo: evaluation.appliesTo,
          amountOre: evaluation.amountOre,
          productsDiscountOre: evaluation.productsDiscountOre,
          shippingDiscountOre: evaluation.shippingDiscountOre,
        }
      : { code: request.discountCode, valid: false, reason: evaluation.reason };
  }

  return { items, valid, subtotalOre, shippingOre, freeShipping, discount };
}

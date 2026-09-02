import { calculateTaxFromGross } from "./tax";

export type Locale = "sv-SE" | "en-SE";

export type CartItemInput = {
  sku: string;
  nameSv: string;
  nameEn: string;
  quantity: number;
  /** Bruttopris (inkl. moms) per styck, i öre. */
  unitPriceOre: number;
  taxRateHundredthsPercent: number;
};

export type ShippingInput = {
  nameSv: string;
  nameEn: string;
  /** Bruttopris (inkl. moms), i öre. */
  amountOre: number;
  taxRateHundredthsPercent: number;
};

export type DiscountInput = {
  code: string;
  /** Rabattens storlek som ett positivt belopp i öre — läggs på ordern som en negativ rad. */
  amountOre: number;
  taxRateHundredthsPercent: number;
};

export type KustomOrderLine = {
  type: "physical" | "shipping_fee" | "discount";
  reference: string;
  name: string;
  quantity: number;
  quantity_unit: string;
  unit_price: number;
  tax_rate: number;
  total_amount: number;
  total_discount_amount: number;
  total_tax_amount: number;
};

function localizedName(sv: string, en: string, locale: Locale): string {
  return locale === "en-SE" ? en : sv;
}

export function buildOrderLines({
  items,
  shipping,
  discount,
  locale,
}: {
  items: CartItemInput[];
  shipping?: ShippingInput;
  discount?: DiscountInput;
  locale: Locale;
}): KustomOrderLine[] {
  const lines: KustomOrderLine[] = items.map((item) => {
    const totalAmount = item.unitPriceOre * item.quantity;
    const { taxAmount } = calculateTaxFromGross(totalAmount, item.taxRateHundredthsPercent);
    return {
      type: "physical",
      reference: item.sku,
      name: localizedName(item.nameSv, item.nameEn, locale),
      quantity: item.quantity,
      quantity_unit: "st",
      unit_price: item.unitPriceOre,
      tax_rate: item.taxRateHundredthsPercent,
      total_amount: totalAmount,
      total_discount_amount: 0,
      total_tax_amount: taxAmount,
    };
  });

  if (shipping) {
    const { taxAmount } = calculateTaxFromGross(
      shipping.amountOre,
      shipping.taxRateHundredthsPercent,
    );
    lines.push({
      type: "shipping_fee",
      reference: "SHIPPING",
      name: localizedName(shipping.nameSv, shipping.nameEn, locale),
      quantity: 1,
      quantity_unit: "st",
      unit_price: shipping.amountOre,
      tax_rate: shipping.taxRateHundredthsPercent,
      total_amount: shipping.amountOre,
      total_discount_amount: 0,
      total_tax_amount: taxAmount,
    });
  }

  if (discount) {
    const negativeAmount = -discount.amountOre;
    const { taxAmount } = calculateTaxFromGross(
      discount.amountOre,
      discount.taxRateHundredthsPercent,
    );
    lines.push({
      type: "discount",
      reference: discount.code,
      name: locale === "en-SE" ? `Discount (${discount.code})` : `Rabatt (${discount.code})`,
      quantity: 1,
      quantity_unit: "st",
      unit_price: negativeAmount,
      tax_rate: discount.taxRateHundredthsPercent,
      total_amount: negativeAmount,
      total_discount_amount: 0,
      total_tax_amount: -taxAmount,
    });
  }

  return lines;
}

export type MerchantUrls = {
  terms: string;
  checkout: string;
  confirmation: string;
  push: string;
  validation: string;
};

export type KustomCreateOrderPayload = {
  purchase_country: "SE";
  purchase_currency: "SEK";
  locale: Locale;
  order_amount: number;
  order_tax_amount: number;
  order_lines: KustomOrderLine[];
  merchant_urls: MerchantUrls;
};

export function buildCreateOrderPayload({
  items,
  shipping,
  discount,
  locale,
  merchantUrls,
}: {
  items: CartItemInput[];
  shipping?: ShippingInput;
  discount?: DiscountInput;
  locale: Locale;
  merchantUrls: MerchantUrls;
}): KustomCreateOrderPayload {
  const orderLines = buildOrderLines({ items, shipping, discount, locale });
  const orderAmount = orderLines.reduce((sum, line) => sum + line.total_amount, 0);
  const orderTaxAmount = orderLines.reduce((sum, line) => sum + line.total_tax_amount, 0);

  return {
    purchase_country: "SE",
    purchase_currency: "SEK",
    locale,
    order_amount: orderAmount,
    order_tax_amount: orderTaxAmount,
    order_lines: orderLines,
    merchant_urls: merchantUrls,
  };
}

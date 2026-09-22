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
  /** Per styck, i gram - läggs på raden som attributes.weight, se KustomOrderLine. */
  weightGrams: number;
};

export type ShippingInput = {
  nameSv: string;
  nameEn: string;
  /** Bruttopris (inkl. moms), i öre. */
  amountOre: number;
  taxRateHundredthsPercent: number;
};

export type DiscountInput = {
  /** Rabattkodens namn - alltid raden `reference` (används av persist-order.ts för att räkna upp discountCodes.usedCount), oavsett `label`. */
  code: string;
  /** Rabattens storlek som ett positivt belopp i öre - läggs på ordern som en negativ rad. */
  amountOre: number;
  taxRateHundredthsPercent: number;
  /**
   * Anpassat radnamn - används i stället för standardnamnet "Rabatt
   * (${code})"/"Discount (${code})" när raden representerar mer än
   * bara koden (t.ex. fri frakt vid tröskelbelopp, eller en kombination
   * av kod + fri frakt - se checkout/session/route.ts).
   */
  label?: { sv: string; en: string };
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
  /**
   * "Shipping attributes" - bekräftat fält i Kustoms Shipping API-guide
   * (delad av er 2026-09-21, exempel: `"attributes": { "weight": 890,
   * "tags": [...] }`) - skickas vidare till TMS/Shipping API (PostNord)
   * så vikten följer med ordern. Bara på physical-rader; weight är
   * per styck i gram (matchar hur unit_price också är per styck).
   */
  attributes?: { weight: number };
};

/**
 * Statisk fallback-rad Kustom Shipping Assistant (KSA) visar om er
 * TMS/Shipping API (PostNord-integrationen) inte svarar - se
 * "Kustom Shipping Assistant"-guiden (delad av er 2026-09-21). Byggs av
 * samma fraktberäkning som `shipping_fee`-raden nedan, INTE en egen
 * separat momssats.
 */
export type KustomShippingOption = {
  id: string;
  name: string;
  /** Bruttopris (inkl. moms), i öre - fältet heter `price` i KSA:s spec, inte `amount`. */
  price: number;
  tax_amount: number;
  tax_rate: number;
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
      attributes: { weight: item.weightGrams },
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
      name: discount.label
        ? localizedName(discount.label.sv, discount.label.en, locale)
        : locale === "en-SE"
          ? `Discount (${discount.code})`
          : `Rabatt (${discount.code})`,
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
  /**
   * Triggar Kustom Shipping Assistant (KSA) tillsammans med
   * `shipping_options` nedan - utan `allow_separate_shipping_address:
   * true` visas ALDRIG PostNords fraktalternativ i checkouten, oavsett
   * KSA-konfiguration i Kustom-portalen. Satt till true alltid (er sajt
   * säljer bara fysiska varor - inget digitalt-only-fall att hantera).
   */
  options: {
    allow_separate_shipping_address: true;
    /**
     * Aktiverar "Köper som företag" i Kustoms EGEN checkout-widget
     * (bekräftat 2026-09-22, se docs/kustom.md) - kräver att B2B är
     * aktiverat på kontot (ägaren aktiverade det samma dag). Kunden
     * väljer själv företag/privatperson och fyller i uppgifterna INNE i
     * Kustoms iframe - vi bygger ingen egen ruta för det här.
     */
    allowed_customer_types: ["person", "organization"];
    /** Visar ett extra, valfritt momsregistreringsnummer-fält i adressformuläret - bara relevant för B2B-ordrar. */
    show_vat_registration_number_field: true;
  };
  /**
   * Statisk fallback KSA visar om TMS/Shipping API-anropet till PostNord
   * misslyckas - se KustomShippingOption ovan. Alltid exakt en post
   * (vårt vanliga fraktpris/fri frakt), aldrig utelämnad - Kustoms guide
   * rekommenderar att alltid skicka den tillsammans med
   * allow_separate_shipping_address.
   */
  shipping_options: KustomShippingOption[];
};

export function buildCreateOrderPayload({
  items,
  shipping,
  shippingOption,
  discount,
  locale,
  merchantUrls,
}: {
  items: CartItemInput[];
  shipping?: ShippingInput;
  /** Fallback-alternativet för KSA - se KustomShippingOption. Skickas alltid med, oavsett om `shipping` (fri frakt) är satt. */
  shippingOption: KustomShippingOption;
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
    options: {
      allow_separate_shipping_address: true,
      allowed_customer_types: ["person", "organization"],
      show_vat_registration_number_field: true,
    },
    shipping_options: [shippingOption],
  };
}

import { describe, expect, it } from "vitest";
import { buildCreateOrderPayload, buildOrderLines } from "./order-payload";

const merchantUrls = {
  terms: "https://trancoffeelab.com/villkor",
  checkout: "https://trancoffeelab.com/checkout",
  confirmation: "https://trancoffeelab.com/tack?order_id={checkout.order.id}",
  push: "https://admin.trancoffeelab.com/api/kustom/push?order_id={checkout.order.id}",
  validation: "https://admin.trancoffeelab.com/api/kustom/validate",
};

describe("buildOrderLines", () => {
  it("bygger en physical-rad per produkt med korrekt momsräkning", () => {
    const lines = buildOrderLines({
      items: [
        {
          sku: "NRH-250",
          nameSv: "No Regrets Horse 250g",
          nameEn: "No Regrets Horse 250g",
          quantity: 2,
          unitPriceOre: 14900,
          taxRateHundredthsPercent: 1200,
        },
      ],
      locale: "sv-SE",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "physical",
      reference: "NRH-250",
      name: "No Regrets Horse 250g",
      quantity: 2,
      unit_price: 14900,
      tax_rate: 1200,
      total_amount: 29800,
    });
    expect(lines[0].total_tax_amount).toBeGreaterThan(0);
  });

  it("väljer engelskt namn för en-SE-locale", () => {
    const lines = buildOrderLines({
      items: [
        {
          sku: "NRH-250",
          nameSv: "Namn på svenska",
          nameEn: "English name",
          quantity: 1,
          unitPriceOre: 100,
          taxRateHundredthsPercent: 0,
        },
      ],
      locale: "en-SE",
    });
    expect(lines[0].name).toBe("English name");
  });

  it("lägger frakt som egen shipping_fee-rad", () => {
    const lines = buildOrderLines({
      items: [],
      shipping: {
        nameSv: "Frakt",
        nameEn: "Shipping",
        amountOre: 4900,
        taxRateHundredthsPercent: 2500,
      },
      locale: "sv-SE",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("shipping_fee");
    expect(lines[0].total_amount).toBe(4900);
  });

  it("lägger rabatt som en negativ discount-rad", () => {
    const lines = buildOrderLines({
      items: [],
      discount: { code: "SOMMAR10", amountOre: 1000, taxRateHundredthsPercent: 1200 },
      locale: "sv-SE",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe("discount");
    expect(lines[0].total_amount).toBe(-1000);
    expect(lines[0].total_tax_amount).toBeLessThan(0);
  });
});

const standardShippingOption = {
  id: "standard",
  name: "Frakt",
  price: 4900,
  tax_amount: 980,
  tax_rate: 2500,
};

describe("buildCreateOrderPayload", () => {
  it("summerar order_amount och order_tax_amount över alla rader", () => {
    const payload = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "No Regrets Horse 250g",
          nameEn: "No Regrets Horse 250g",
          quantity: 1,
          unitPriceOre: 14900,
          taxRateHundredthsPercent: 1200,
        },
      ],
      shipping: {
        nameSv: "Frakt",
        nameEn: "Shipping",
        amountOre: 4900,
        taxRateHundredthsPercent: 2500,
      },
      shippingOption: standardShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    const expectedTotal = payload.order_lines.reduce((sum, l) => sum + l.total_amount, 0);
    const expectedTax = payload.order_lines.reduce((sum, l) => sum + l.total_tax_amount, 0);

    expect(payload.order_amount).toBe(expectedTotal);
    expect(payload.order_tax_amount).toBe(expectedTax);
    expect(payload.purchase_country).toBe("SE");
    expect(payload.purchase_currency).toBe("SEK");
    expect(payload.merchant_urls).toEqual(merchantUrls);
  });

  it("order_amount minskar korrekt när en rabattkod tillämpas", () => {
    const withoutDiscount = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "x",
          nameEn: "x",
          quantity: 1,
          unitPriceOre: 10000,
          taxRateHundredthsPercent: 1200,
        },
      ],
      shippingOption: standardShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    const withDiscount = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "x",
          nameEn: "x",
          quantity: 1,
          unitPriceOre: 10000,
          taxRateHundredthsPercent: 1200,
        },
      ],
      discount: { code: "TEST", amountOre: 1000, taxRateHundredthsPercent: 1200 },
      shippingOption: standardShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    expect(withDiscount.order_amount).toBe(withoutDiscount.order_amount - 1000);
  });

  it("sätter options.allow_separate_shipping_address = true, alltid - annars triggas aldrig Kustom Shipping Assistant (KSA)", () => {
    const payload = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "x",
          nameEn: "x",
          quantity: 1,
          unitPriceOre: 10000,
          taxRateHundredthsPercent: 1200,
        },
      ],
      shippingOption: standardShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    expect(payload.options).toEqual({ allow_separate_shipping_address: true });
  });

  it("skickar med det angivna shipping_option som KSA:s fallback, alltid exakt en post", () => {
    const payload = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "x",
          nameEn: "x",
          quantity: 1,
          unitPriceOre: 10000,
          taxRateHundredthsPercent: 1200,
        },
      ],
      shippingOption: standardShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    expect(payload.shipping_options).toEqual([standardShippingOption]);
  });

  it("skickar shipping_options även vid fri frakt (0 kr), inte utelämnat", () => {
    const freeShippingOption = { ...standardShippingOption, price: 0, tax_amount: 0 };
    const payload = buildCreateOrderPayload({
      items: [
        {
          sku: "NRH-250",
          nameSv: "x",
          nameEn: "x",
          quantity: 1,
          unitPriceOre: 10000,
          taxRateHundredthsPercent: 1200,
        },
      ],
      shippingOption: freeShippingOption,
      locale: "sv-SE",
      merchantUrls,
    });

    expect(payload.shipping_options).toEqual([freeShippingOption]);
  });
});

import { describe, it, expect } from "vitest";
import { computeDiscountSplit } from "./discount-split";

describe("computeDiscountSplit", () => {
  describe("percentage, appliesTo: products", () => {
    it("discounts only the products base, shipping untouched", () => {
      const result = computeDiscountSplit("percentage", 10000, "products", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 34900, shippingDiscountOre: 0 });
    });

    it("partial percentage", () => {
      const result = computeDiscountSplit("percentage", 1500, "products", 10000, 4900);
      expect(result).toEqual({ productsDiscountOre: 1500, shippingDiscountOre: 0 });
    });
  });

  describe("percentage, appliesTo: shipping", () => {
    it("discounts only the shipping base, products untouched", () => {
      const result = computeDiscountSplit("percentage", 10000, "shipping", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 0, shippingDiscountOre: 4900 });
    });

    it("is 0 when shipping is already free (base is 0)", () => {
      const result = computeDiscountSplit("percentage", 10000, "shipping", 34900, 0);
      expect(result).toEqual({ productsDiscountOre: 0, shippingDiscountOre: 0 });
    });
  });

  describe("percentage, appliesTo: both", () => {
    it("100% zeroes out products AND shipping (the FREEFORALL case)", () => {
      const result = computeDiscountSplit("percentage", 10000, "both", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 34900, shippingDiscountOre: 4900 });
    });

    it("applies the same rate to each base independently", () => {
      const result = computeDiscountSplit("percentage", 1000, "both", 20000, 4900);
      expect(result).toEqual({ productsDiscountOre: 2000, shippingDiscountOre: 490 });
    });
  });

  describe("fixed, appliesTo: products", () => {
    it("is capped at the products subtotal, never exceeds it", () => {
      const result = computeDiscountSplit("fixed", 100000, "products", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 34900, shippingDiscountOre: 0 });
    });

    it("under the subtotal comes off cleanly", () => {
      const result = computeDiscountSplit("fixed", 5000, "products", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 5000, shippingDiscountOre: 0 });
    });
  });

  describe("fixed, appliesTo: shipping", () => {
    it("is capped at the shipping cost", () => {
      const result = computeDiscountSplit("fixed", 100000, "shipping", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 0, shippingDiscountOre: 4900 });
    });
  });

  describe("fixed, appliesTo: both — waterfall (products first, remainder to shipping)", () => {
    it("a small fixed amount only reduces products", () => {
      const result = computeDiscountSplit("fixed", 2000, "both", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 2000, shippingDiscountOre: 0 });
    });

    it("spills the remainder onto shipping once products are exhausted", () => {
      const result = computeDiscountSplit("fixed", 39000, "both", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 34900, shippingDiscountOre: 4100 });
    });

    it("never discounts more than products + shipping combined", () => {
      const result = computeDiscountSplit("fixed", 999999, "both", 34900, 4900);
      expect(result).toEqual({ productsDiscountOre: 34900, shippingDiscountOre: 4900 });
      expect(result.productsDiscountOre + result.shippingDiscountOre).toBe(34900 + 4900);
    });
  });
});

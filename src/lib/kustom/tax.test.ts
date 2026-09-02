import { describe, expect, it } from "vitest";
import { calculateTaxFromGross } from "./tax";

describe("calculateTaxFromGross", () => {
  it("räknar 25% moms på 149,00 kr exakt", () => {
    const result = calculateTaxFromGross(14900, 2500);
    expect(result.netAmount).toBe(11920);
    expect(result.taxAmount).toBe(2980);
    expect(result.netAmount + result.taxAmount).toBe(14900);
  });

  it("räknar 12% moms (livsmedel) på 100 öre", () => {
    const result = calculateTaxFromGross(100, 1200);
    expect(result.netAmount + result.taxAmount).toBe(100);
    expect(result.taxAmount).toBe(11);
  });

  it("0% moms ger hela beloppet som netto", () => {
    const result = calculateTaxFromGross(5000, 0);
    expect(result.netAmount).toBe(5000);
    expect(result.taxAmount).toBe(0);
  });

  it("netAmount + taxAmount summerar alltid exakt till grossAmount, för udda belopp", () => {
    for (const gross of [1, 33, 99, 333, 1001, 149900]) {
      for (const rate of [0, 600, 1200, 2500]) {
        const result = calculateTaxFromGross(gross, rate);
        expect(result.netAmount + result.taxAmount).toBe(gross);
      }
    }
  });

  it("kastar för icke-heltalsbelopp", () => {
    expect(() => calculateTaxFromGross(100.5, 2500)).toThrow();
  });

  it("kastar för negativ momssats", () => {
    expect(() => calculateTaxFromGross(100, -1)).toThrow();
  });
});

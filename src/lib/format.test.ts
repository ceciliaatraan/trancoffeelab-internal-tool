import { describe, expect, it } from "vitest";
import { formatOre, formatTaxRate } from "./format";

/** sv-SE:s valutaformat separerar belopp och "kr" med en hårt mellanslag (U+00A0). */
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, " ");
}

describe("formatOre", () => {
  it("formaterar öre som svenska kronor", () => {
    expect(normalizeSpaces(formatOre(14900))).toBe("149,00 kr");
  });

  it("hanterar noll", () => {
    expect(normalizeSpaces(formatOre(0))).toBe("0,00 kr");
  });

  it("rundar aldrig — öre är redan heltal", () => {
    expect(normalizeSpaces(formatOre(100))).toBe("1,00 kr");
  });
});

describe("formatTaxRate", () => {
  it("konverterar hundradels procent till procent", () => {
    expect(formatTaxRate(2500)).toBe("25%");
    expect(formatTaxRate(1200)).toBe("12%");
    expect(formatTaxRate(0)).toBe("0%");
  });
});

import { describe, expect, it } from "vitest";
import { formatDateTime, formatOre, formatTaxRate } from "./format";

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

  it("rundar aldrig - öre är redan heltal", () => {
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

describe("formatDateTime", () => {
  it("visar svensk lokal tid (sommartid, UTC+2), inte serverns UTC-tid", () => {
    // 2026-09-08T11:18:00Z ska visas som 13:18 i Stockholm-tid - precis
    // det scenario som avslöjade att adminet tidigare visade UTC rakt av.
    const utc = new Date("2026-09-08T11:18:00Z");
    expect(formatDateTime(utc)).toContain("13:18");
    expect(formatDateTime(utc)).not.toContain("11:18");
  });

  it("visar svensk lokal tid (vintertid, UTC+1)", () => {
    const utc = new Date("2026-01-08T11:18:00Z");
    expect(formatDateTime(utc)).toContain("12:18");
  });
});

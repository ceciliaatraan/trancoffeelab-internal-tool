import { describe, expect, it } from "vitest";
import { previousDayKey, stockholmDayKey, summarizeDailySales, type DailySales } from "./day-buckets";

describe("stockholmDayKey", () => {
  it("rullar över till nästa svenska dag efter midnatt (sommartid, UTC+2)", () => {
    expect(stockholmDayKey(new Date("2026-09-08T22:30:00Z"))).toBe("2026-09-09");
  });

  it("rullar över till nästa svenska dag efter midnatt (vintertid, UTC+1)", () => {
    expect(stockholmDayKey(new Date("2026-01-08T23:30:00Z"))).toBe("2026-01-09");
  });

  it("stannar på samma dag strax före svensk midnatt", () => {
    expect(stockholmDayKey(new Date("2026-09-08T21:30:00Z"))).toBe("2026-09-08");
  });
});

describe("previousDayKey", () => {
  it("går en dag bakåt inom samma månad", () => {
    expect(previousDayKey("2026-09-09")).toBe("2026-09-08");
  });

  it("går över ett månadsskifte", () => {
    expect(previousDayKey("2026-09-01")).toBe("2026-08-31");
  });

  it("går över ett årsskifte", () => {
    expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
  });

  it("går korrekt förbi sommartidsskiftet i mars (ingen dubblerad/förlorad dag)", () => {
    expect(previousDayKey("2026-03-30")).toBe("2026-03-29");
  });
});

function makeDaily(entries: [string, number, number][]): DailySales[] {
  return entries.map(([dayKey, totalOre, orderCount]) => ({
    dayKey,
    label: dayKey,
    totalOre,
    orderCount,
  }));
}

describe("summarizeDailySales", () => {
  it("summerar idag, denna vecka (måndag-start) och denna månad korrekt", () => {
    // Tisdag 2026-09-08 - måndagen är 2026-09-07.
    const daily = makeDaily([
      ["2026-08-31", 10000, 1], // förra veckan/månaden, ska inte räknas med i vecka eller månad
      ["2026-09-01", 5000, 1], // denna månad, förra veckan
      ["2026-09-07", 20000, 2], // måndag denna vecka
      ["2026-09-08", 15000, 1], // idag (tisdag)
    ]);
    const summary = summarizeDailySales(daily);
    expect(summary.todayOre).toBe(15000);
    expect(summary.weekOre).toBe(35000); // 2026-09-07 + 2026-09-08
    expect(summary.monthOre).toBe(40000); // 09-01 + 09-07 + 09-08
    expect(summary.monthOrderCount).toBe(4);
    expect(summary.monthAvgOrderOre).toBe(10000);
  });

  it("returnerar 0 överallt för en tom lista utan att krascha", () => {
    const summary = summarizeDailySales([]);
    expect(summary.todayOre).toBe(0);
    expect(summary.weekOre).toBe(0);
    expect(summary.monthOre).toBe(0);
    expect(summary.monthOrderCount).toBe(0);
    expect(summary.monthAvgOrderOre).toBe(0);
  });

  it("delar aldrig med noll för snittordervärde utan ordrar denna månad", () => {
    const daily = makeDaily([["2026-09-08", 0, 0]]);
    expect(summarizeDailySales(daily).monthAvgOrderOre).toBe(0);
  });
});

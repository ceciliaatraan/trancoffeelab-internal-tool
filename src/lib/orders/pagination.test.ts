import { describe, expect, it } from "vitest";
import { ordersHref, pageCount, parsePageParams, visiblePages } from "./pagination";

describe("parsePageParams", () => {
  it("25 per sida och sida 1 som standard", () => {
    expect(parsePageParams({})).toEqual({ page: 1, perPage: 25 });
  });
  it("tillåter bara 25, 50 och 100 per sida", () => {
    expect(parsePageParams({ perPage: "50", page: "3" })).toEqual({ page: 3, perPage: 50 });
    expect(parsePageParams({ perPage: "100" }).perPage).toBe(100);
    expect(parsePageParams({ perPage: "1000" }).perPage).toBe(25);
  });
  it("ogiltiga sidor blir sida 1", () => {
    expect(parsePageParams({ page: "0" }).page).toBe(1);
    expect(parsePageParams({ page: "-2" }).page).toBe(1);
    expect(parsePageParams({ page: "abc" }).page).toBe(1);
    expect(parsePageParams({ page: "2.5" }).page).toBe(1);
  });
});

describe("pageCount", () => {
  it("rundar uppåt och är minst 1", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});

describe("visiblePages", () => {
  it("visar första, sista och grannar med luckor", () => {
    expect(visiblePages(1, 1)).toEqual([1]);
    expect(visiblePages(1, 3)).toEqual([1, 2, 3]);
    expect(visiblePages(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(visiblePages(10, 10)).toEqual([1, null, 9, 10]);
  });
});

describe("ordersHref", () => {
  const current = { q: "", status: "", perPage: 25, page: 1 };
  it("utelämnar standardvärden", () => {
    expect(ordersHref(current, {})).toBe("/orders");
  });
  it("behåller filter och byter sida/antal", () => {
    expect(ordersHref({ ...current, q: "anna", status: "shipped" }, { page: 2 })).toBe(
      "/orders?q=anna&status=shipped&page=2",
    );
    expect(ordersHref({ ...current, page: 4 }, { perPage: 50, page: 1 })).toBe("/orders?perPage=50");
  });
});

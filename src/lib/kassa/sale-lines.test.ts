import { describe, expect, it } from "vitest";
import { buildSaleLines, type KassaItem } from "./sale-lines";
import {
  buildSwishQrRequest,
  normalizeSwishNumber,
  swishMessageForSale,
  swishPayeeNumber,
} from "./swish-qr";
import { parseKassaPlace } from "./options";

const catalog: KassaItem[] = [
  { sku: "KIT-FULL", productId: "p1", variantId: null, name: "Komplett kit", priceOre: 34900, taxRate: 1075 },
  { sku: "PHIN-S", productId: "p2", variantId: "v1", name: "Phin-filter - Liten", priceOre: 19900, taxRate: 2500 },
];

describe("buildSaleLines", () => {
  it("räknar rader, summa och moms med kassans egna priser och slår ihop samma vara", () => {
    const sale = buildSaleLines(catalog, [
      { sku: "KIT-FULL", quantity: 1 },
      { sku: "PHIN-S", quantity: 1 },
      { sku: "KIT-FULL", quantity: 1 },
    ]);
    expect(sale.lines).toHaveLength(2);
    expect(sale.lines[0]).toMatchObject({ sku: "KIT-FULL", quantity: 2, totalOre: 69800 });
    expect(sale.totalOre).toBe(69800 + 19900);
    expect(sale.lines[1].taxOre).toBe(3980);
    expect(sale.taxOre).toBe(sale.lines[0].taxOre + 3980);
  });

  it("nekar tom försäljning, okänd vara och orimliga antal", () => {
    expect(() => buildSaleLines(catalog, [])).toThrow();
    expect(() => buildSaleLines(catalog, [{ sku: "OKÄND", quantity: 1 }])).toThrow(/Okänd vara/);
    expect(() => buildSaleLines(catalog, [{ sku: "KIT-FULL", quantity: 0 }])).toThrow();
    expect(() => buildSaleLines(catalog, [{ sku: "KIT-FULL", quantity: 1.5 }])).toThrow();
    expect(() => buildSaleLines(catalog, [{ sku: "KIT-FULL", quantity: 100 }])).toThrow(/Högst/);
  });
});

describe("Swish-QR", () => {
  it("tar bara siffror ur Swish-numret", () => {
    expect(normalizeSwishNumber("123 456 78 90")).toBe("1234567890");
    expect(normalizeSwishNumber("")).toBeNull();
    expect(normalizeSwishNumber(undefined)).toBeNull();
  });

  it("använder TRAN:s nummer 123-694 96 06 om inget annat är inställt", () => {
    const original = process.env.SWISH_PAYEE_NUMBER;
    delete process.env.SWISH_PAYEE_NUMBER;
    expect(swishPayeeNumber()).toBe("1236949606");
    process.env.SWISH_PAYEE_NUMBER = "123-111 22 33";
    expect(swishPayeeNumber()).toBe("1231112233");
    if (original === undefined) delete process.env.SWISH_PAYEE_NUMBER;
    else process.env.SWISH_PAYEE_NUMBER = original;
  });

  it("låser mottagare, belopp i kronor och meddelande", () => {
    const body = buildSwishQrRequest("1234567890", 34950, swishMessageForSale(12));
    expect(body.payee).toEqual({ value: "1234567890", editable: false });
    expect(body.amount).toEqual({ value: 349.5, editable: false });
    expect(body.message).toEqual({ value: "TRAN kassa 12", editable: false });
  });
});

describe("parseKassaPlace", () => {
  it("läser sparad plats och anteckning, och faller tillbaka vid skräp", () => {
    const raw = encodeURIComponent(JSON.stringify({ location: "restaurang_boras", note: "Lunch" }));
    expect(parseKassaPlace(raw)).toEqual({ location: "restaurang_boras", note: "Lunch" });
    expect(parseKassaPlace(encodeURIComponent(JSON.stringify({ location: "okänd" })))).toEqual({
      location: "event",
      note: "",
    });
    expect(parseKassaPlace("%%%")).toEqual({ location: "event", note: "" });
    expect(parseKassaPlace(undefined)).toEqual({ location: "event", note: "" });
  });
});

describe("parseKassaPlace med redan avkodat värde", () => {
  it("klarar ett procenttecken i anteckningen", () => {
    expect(parseKassaPlace(JSON.stringify({ location: "event", note: "50% av allt" }))).toEqual({
      location: "event",
      note: "50% av allt",
    });
  });
});

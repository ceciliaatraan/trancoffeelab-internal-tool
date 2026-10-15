import { describe, expect, it } from "vitest";
import { RECEIPT_SELLER, renderReceiptEmail, vatBreakdown } from "./pos-receipt";

const input = {
  to: "kund@example.com",
  saleNumber: 12,
  paidAt: new Date("2026-10-15T11:18:00Z"),
  location: "Restaurang TRAN",
  totalOre: 39800,
  lines: [
    { name: "Komplett kit", quantity: 1, lineTotalOre: 34900, taxRate: 1075, slug: "full-kit", imageUrl: "https://x/kit.png" },
    { name: "Kondenserad mjölk", quantity: 1, lineTotalOre: 4900, taxRate: 600 },
  ],
};

describe("renderReceiptEmail", () => {
  it("är ett kvitto - inte en orderbekräftelse - med nummer, datum, ställe och betalsätt", () => {
    const { subject, text, html } = renderReceiptEmail(input);
    expect(subject).toBe("Kvitto #12 - TRAN Coffee Lab");
    expect(html).toContain("Kvitto #12");
    expect(html).not.toContain("Orderbekräftelse");
    expect(text).toContain("Datum: 2026-10-15 13:18");
    expect(text).toContain("Försäljningsställe: Restaurang TRAN");
    expect(text).toContain("Betalsätt: Swish");
    expect(text).toContain("1 × Komplett kit - 349,00 kr");
    expect(text).toContain("Totalt: 398,00 kr");
  });

  it("visar moms per momssats och säljarens företagsuppgifter", () => {
    const { text, html } = renderReceiptEmail(input);
    expect(text).toContain("Varav moms 6 %: 2,77 kr");
    expect(text).toContain("Varav moms 10,75 %:");
    expect(html).toContain(RECEIPT_SELLER.orgNumber);
    expect(html).toContain(RECEIPT_SELLER.vatNumber);
    expect(text).toContain(RECEIPT_SELLER.address);
  });

  it("länkar produkten till sajten och escapar namn", () => {
    const { html } = renderReceiptEmail({
      ...input,
      lines: [{ name: "<Kaffe & mjölk>", quantity: 1, lineTotalOre: 100, taxRate: 600, slug: "full-kit" }],
    });
    expect(html).toContain("https://trancoffeelab.com/produkt/full-kit");
    expect(html).toContain("&lt;Kaffe &amp; mjölk&gt;");
  });
});

describe("vatBreakdown", () => {
  it("summerar moms per sats", () => {
    expect(
      vatBreakdown([
        { name: "a", quantity: 1, lineTotalOre: 10600, taxRate: 600 },
        { name: "b", quantity: 1, lineTotalOre: 10600, taxRate: 600 },
        { name: "c", quantity: 1, lineTotalOre: 12500, taxRate: 2500 },
      ]),
    ).toEqual([
      { taxRate: 600, taxOre: 1200 },
      { taxRate: 2500, taxOre: 2500 },
    ]);
  });
});

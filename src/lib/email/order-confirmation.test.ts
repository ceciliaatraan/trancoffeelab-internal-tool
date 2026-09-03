import { describe, expect, it } from "vitest";
import { renderEmail } from "./order-confirmation";

const baseInput = {
  to: "kund@example.com",
  orderNumber: 1042,
  totalOre: 29800,
  lines: [{ name: "No Regrets Horse 250g", quantity: 2 }],
};

describe("renderEmail", () => {
  it("renderar på svenska för sv-SE", () => {
    const { subject, text } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(subject).toContain("Orderbekräftelse");
    expect(subject).toContain("#1042");
    expect(text).toContain("Tack för din beställning");
    expect(text).toContain("298,00 kr");
    expect(text).toContain("2 × No Regrets Horse 250g");
  });

  it("renderar på engelska för en-SE", () => {
    const { subject, text } = renderEmail({ ...baseInput, locale: "en-SE" });
    expect(subject).toContain("Order confirmation");
    expect(text).toContain("Thank you for your order");
    expect(text).toContain("298.00 kr");
  });

  it("listar flera rader", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        { name: "No Regrets Horse 250g", quantity: 1 },
        { name: "Frakt", quantity: 1 },
      ],
    });
    expect(text).toContain("1 × No Regrets Horse 250g");
    expect(text).toContain("1 × Frakt");
  });

  it("förklarar en ren förbeställningsorder tydligt (sv)", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        {
          name: "No Regrets Horse 250g",
          quantity: 2,
          isPreorder: true,
          expectedShipDate: "2026-11-15",
        },
      ],
    });
    expect(text).toContain("Det här är en förbeställning");
    expect(text).toContain("Du har betalat nu");
    expect(text).toContain("förbeställning, beräknad leverans: november 2026");
    expect(text).not.toContain("Tack för din beställning");
  });

  it("förklarar en ren förbeställningsorder tydligt (en)", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "en-US",
      lines: [
        {
          name: "No Regrets Horse 250g",
          quantity: 1,
          isPreorder: true,
          expectedShipDate: "2026-11-15",
        },
      ],
    });
    expect(text).toContain("This is a preorder");
    expect(text).toContain("charged now");
    expect(text).toContain("preorder, estimated ship: November 2026");
  });

  it("förklarar en blandad order rad för rad, inte som en klump (sv)", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        { name: "Dancing Dragon 250g", quantity: 1 },
        {
          name: "No Regrets Horse 250g",
          quantity: 1,
          isPreorder: true,
          expectedShipDate: "2026-12-01",
        },
      ],
    });
    expect(text).toContain("Din order innehåller både lagervaror och en förbeställning");
    expect(text).toContain("1 × Dancing Dragon 250g");
    expect(text).not.toContain("Dancing Dragon 250g —");
    expect(text).toContain(
      "1 × No Regrets Horse 250g — förbeställning, beräknad leverans: december 2026",
    );
  });

  it("visar 'meddelas senare' när expectedShipDate saknas", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        { name: "No Regrets Horse 250g", quantity: 1, isPreorder: true, expectedShipDate: null },
      ],
    });
    expect(text).toContain("beräknad leverans: meddelas senare");
  });
});

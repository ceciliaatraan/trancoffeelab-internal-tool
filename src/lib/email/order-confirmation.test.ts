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

  it("html-versionen innehåller ordernummer, radvara och totalsumma", () => {
    const { html } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(html).toContain("#1042");
    expect(html).toContain("No Regrets Horse 250g");
    expect(html).toContain("298,00");
  });

  it("html-versionen escapar produktnamn — ingen rå HTML/skript slinker igenom", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [{ name: '<script>alert("x")</script>', quantity: 1 }],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("html-versionen visar förbeställningsmärkning bara på rader som faktiskt är förbeställningar", () => {
    const { html } = renderEmail({
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
    // Räknar bara den röda per-rad-märkningen, inte inledningstexten (som
    // själv legitimt nämner "förbeställning" i en blandad order).
    const preorderBadgeCount = (html.match(/color:#EB1C24/g) ?? []).length;
    expect(preorderBadgeCount).toBe(1);
    expect(html).toContain("december 2026");
  });

  it("visar produktbild och radpris när de finns, både i html och text", () => {
    const { html, text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        {
          name: "No Regrets Horse 250g",
          quantity: 2,
          imageUrl: "https://admin.trancoffeelab.com/uploads/no-regrets-horse.jpg",
          lineTotalOre: 29800,
        },
      ],
    });
    expect(html).toContain('src="https://admin.trancoffeelab.com/uploads/no-regrets-horse.jpg"');
    expect(html).toContain("298,00 kr");
    expect(text).toContain("2 × No Regrets Horse 250g — 298,00 kr");
  });

  it("visar ingen produktbild om raden saknar imageUrl — bara TRAN-loggan finns kvar", () => {
    const { html } = renderEmail({ ...baseInput, locale: "sv-SE" });
    const imgCount = (html.match(/<img/g) ?? []).length;
    expect(imgCount).toBe(1);
  });

  it("escapar bild-url:en precis som produktnamnet", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        {
          name: "No Regrets Horse 250g",
          quantity: 1,
          imageUrl: 'https://example.com/x.jpg?a="b"',
          lineTotalOre: 100,
        },
      ],
    });
    expect(html).toContain("&quot;b&quot;");
  });

  it("avslutar med hälsning från Cecilia och Winnie, inte den gamla signaturen", () => {
    const { html, text } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(text).toContain("Tack för att ni är med och sprider vietnamesiskt kaffe i Sverige");
    expect(text).toContain("Cecilia Tran & Winnie Tran");
    expect(html).toContain("Tack för att ni är med och sprider vietnamesiskt kaffe i Sverige");
    expect(html).toContain("Cecilia Tran &amp; Winnie Tran");
    expect(text).not.toContain("— TRAN Coffee Lab");
  });

  it("avslutar på engelska med översatt hälsning", () => {
    const { text } = renderEmail({ ...baseInput, locale: "en-US" });
    expect(text).toContain("Thank you for helping us spread Vietnamese coffee across Sweden");
    expect(text).toContain("Cecilia Tran & Winnie Tran");
  });
});

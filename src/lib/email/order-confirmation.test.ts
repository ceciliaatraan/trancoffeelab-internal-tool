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

  it("kraschar inte och faller tillbaka på svenska om locale saknas (t.ex. tomt från Kustom)", () => {
    // locale är typad som obligatorisk sträng, men Kustom har levererat
    // ordrar där fältet faktiskt saknades vid körning - se
    // persist-order.ts, 2026-09-22.
    const { subject, text } = renderEmail({
      ...baseInput,
      locale: undefined as unknown as string,
    });
    expect(subject).toContain("Orderbekräftelse");
    expect(text).toContain("Tack för din beställning");
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
    expect(text).not.toContain("Dancing Dragon 250g -");
    expect(text).toContain(
      "1 × No Regrets Horse 250g - förbeställning, beräknad leverans: december 2026",
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

  it("html-versionen escapar produktnamn - ingen rå HTML/skript slinker igenom", () => {
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
    expect(text).toContain("2 × No Regrets Horse 250g - 298,00 kr");
  });

  it("visar ingen produktbild om raden saknar imageUrl - bara TRAN-loggan finns kvar", () => {
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
    expect(text).not.toContain("- TRAN Coffee Lab");
  });

  it("avslutar på engelska med översatt hälsning", () => {
    const { text } = renderEmail({ ...baseInput, locale: "en-US" });
    expect(text).toContain("Thank you for helping us spread Vietnamese coffee across Sweden");
    expect(text).toContain("Cecilia Tran & Winnie Tran");
  });

  it("visar fraktkostnaden som en egen rad, både i html och text (sv)", () => {
    const { html, text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      shipping: { name: "Standardfrakt", amountOre: 4900 },
    });
    expect(text).toContain("Frakt - Standardfrakt: 49,00 kr");
    expect(html).toContain("Frakt - Standardfrakt");
    expect(html).toContain("49,00 kr");
  });

  it("visar fraktkostnaden på engelska", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "en-US",
      shipping: { name: "Standard shipping", amountOre: 4900 },
    });
    expect(text).toContain("Shipping - Standard shipping: 49.00 kr");
  });

  it("visar ingen fraktrad om anroparen inte skickat med fraktinfo alls (shipping: undefined)", () => {
    const { text } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(text).not.toContain("Frakt:");
  });

  it("visar 'Fri frakt' istället för 0,00 kr när Kustom inte skapade någon fraktrad (shipping: null - gränsen för fri frakt uppnådd)", () => {
    const { html, text } = renderEmail({ ...baseInput, locale: "sv-SE", shipping: null });
    expect(text).toContain("Frakt: Fri frakt");
    expect(text).not.toContain("0,00 kr");
    expect(html).toContain("Fri frakt");
  });

  it("visar 'Fri frakt' även när en riktig fraktrad finns men landar på exakt 0 kr", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      shipping: { name: "Frakt", amountOre: 0 },
    });
    expect(text).toContain("Frakt: Fri frakt");
  });

  it("visar 'Free shipping' på engelska när frakten är gratis", () => {
    const { text } = renderEmail({ ...baseInput, locale: "en-US", shipping: null });
    expect(text).toContain("Shipping: Free shipping");
  });

  it("visar leveranstidsuppskattningen (2-4 arbetsdagar) när ordern har fraktinfo", () => {
    const { html, text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      shipping: { name: "Standardfrakt", amountOre: 4900 },
    });
    expect(text).toContain("2-4 arbetsdagar");
    expect(html).toContain("2-4 arbetsdagar");
  });

  it("visar leveranstidsuppskattningen även vid fri frakt (shipping: null)", () => {
    const { text } = renderEmail({ ...baseInput, locale: "sv-SE", shipping: null });
    expect(text).toContain("2-4 arbetsdagar");
  });

  it("visar ingen leveranstidsuppskattning om anroparen inte skickat med fraktinfo alls (shipping: undefined)", () => {
    const { text } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(text).not.toContain("arbetsdagar");
  });

  it("visar leveranstidsuppskattningen på engelska", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "en-US",
      shipping: { name: "Standard shipping", amountOre: 4900 },
    });
    expect(text).toContain("2-4 business days");
  });

  it("länkar produktbild och namn till produktsidan när raden har en slug", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [
        {
          name: "No Regrets Horse 250g",
          quantity: 1,
          imageUrl: "https://admin.trancoffeelab.com/uploads/horse.jpg",
          slug: "signature-coffee",
        },
      ],
    });
    expect(html).toContain('<a href="https://trancoffeelab.com/produkt/signature-coffee">');
  });

  it("länkar till den engelska produktsökvägen för engelska mejl", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "en-US",
      lines: [{ name: "No Regrets Horse 250g", quantity: 1, slug: "signature-coffee" }],
    });
    expect(html).toContain('href="https://trancoffeelab.com/product/signature-coffee"');
  });

  it("länkar inte produktnamnet om raden saknar slug - bara loggan länkas", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      lines: [{ name: "No Regrets Horse 250g", quantity: 1 }],
    });
    expect(html).not.toContain("/produkt/");
    expect((html.match(/<a href/g) ?? []).length).toBe(1); // bara loggan
  });

  it("loggan länkar till kundsajtens startsida", () => {
    const { html } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(html).toContain('<a href="https://trancoffeelab.com">');
  });

  it("visar företagsuppgifter (namn + momsregnr) när ordern var ett företagsköp (sv)", () => {
    const { html, text } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      business: { name: "Kaffehuset AB", vatNumber: "SE556677889901" },
    });
    expect(text).toContain("Företag: Kaffehuset AB (Momsregnr: SE556677889901)");
    expect(html).toContain("Kaffehuset AB");
    expect(html).toContain("SE556677889901");
  });

  it("visar företagsuppgifter på engelska", () => {
    const { text } = renderEmail({
      ...baseInput,
      locale: "en-US",
      business: { name: "Kaffehuset AB", vatNumber: "SE556677889901" },
    });
    expect(text).toContain("Business: Kaffehuset AB (VAT no.: SE556677889901)");
  });

  it("visar ingen företagsrad för ett vanligt (icke-företags-)köp", () => {
    const { text } = renderEmail({ ...baseInput, locale: "sv-SE" });
    expect(text).not.toContain("Företag:");
  });

  it("escapar företagsnamnet i html-versionen precis som produktnamn", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      business: { name: '<script>alert("x")</script>', vatNumber: "SE123" },
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("respekterar en egen storefrontUrl istället för default-domänen", () => {
    const { html } = renderEmail({
      ...baseInput,
      locale: "sv-SE",
      storefrontUrl: "https://staging.trancoffeelab.com/",
      lines: [{ name: "No Regrets Horse 250g", quantity: 1, slug: "signature-coffee" }],
    });
    expect(html).toContain('<a href="https://staging.trancoffeelab.com">');
    expect(html).toContain('href="https://staging.trancoffeelab.com/produkt/signature-coffee"');
  });
});

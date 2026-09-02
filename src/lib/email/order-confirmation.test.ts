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
});

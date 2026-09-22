import { describe, expect, it } from "vitest";
import { cartRequestSchema } from "./cart";

const baseRequest = { items: [{ sku: "SKU-1", quantity: 1 }] };

describe("cartRequestSchema - business", () => {
  it("business är valfritt - en vanlig kundvagn utan det är giltig", () => {
    const parsed = cartRequestSchema.safeParse(baseRequest);
    expect(parsed.success).toBe(true);
  });

  it("accepterar en giltig 'köper som företag'-payload", () => {
    const parsed = cartRequestSchema.safeParse({
      ...baseRequest,
      business: {
        name: "Kaffehuset AB",
        vatNumber: "SE556677889901",
        address: { street: "Storgatan 1", postalCode: "111 22", city: "Stockholm", country: "SE" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("avvisar business utan momsregistreringsnummer", () => {
    const parsed = cartRequestSchema.safeParse({
      ...baseRequest,
      business: {
        name: "Kaffehuset AB",
        vatNumber: "",
        address: { street: "Storgatan 1", postalCode: "111 22", city: "Stockholm", country: "SE" },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("avvisar business utan adress", () => {
    const parsed = cartRequestSchema.safeParse({
      ...baseRequest,
      business: { name: "Kaffehuset AB", vatNumber: "SE556677889901" },
    });
    expect(parsed.success).toBe(false);
  });
});

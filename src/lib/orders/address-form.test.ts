import { describe, expect, it } from "vitest";
import { parseAddressForm } from "./address-form";

const form = (values: Record<string, string>) => (field: string) => values[field];

const valid = {
  given_name: "Ebba",
  family_name: "Axlund",
  street_address: " Rätt gatan 5 ",
  postal_code: "113 51",
  city: "Stockholm",
  country: "SE",
};

describe("parseAddressForm", () => {
  it("slår ihop med befintlig adress och behåller fält som inte visas", () => {
    const result = parseAddressForm(form(valid), {
      email: "ebba@example.com",
      street_address: "Fel gatan 1",
      street_address2: "Lgh 1001",
    });
    expect(result).toEqual({
      ok: true,
      address: {
        email: "ebba@example.com",
        given_name: "Ebba",
        family_name: "Axlund",
        street_address: "Rätt gatan 5",
        postal_code: "113 51",
        city: "Stockholm",
        country: "se",
      },
    });
  });

  it("kräver obligatoriska fält", () => {
    const result = parseAddressForm(form({ ...valid, city: "  " }), null);
    expect(result).toEqual({ ok: false, error: "Fyll i ort." });
  });

  it("kräver landskod med två bokstäver", () => {
    expect(parseAddressForm(form({ ...valid, country: "Sverige" }), null).ok).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { getAllowedGoogleHd, isCashierEmail, isEmailAllowed, resolveLoginRole } from "./allowlist";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isEmailAllowed", () => {
  it("tillåter en e-post som finns i listan", () => {
    process.env.ALLOWED_ADMIN_EMAILS = "systrarna@trancoffeelab.com";
    expect(isEmailAllowed("systrarna@trancoffeelab.com")).toBe(true);
  });

  it("är skiftlägesokänslig och trimmar mellanslag runt varje adress", () => {
    process.env.ALLOWED_ADMIN_EMAILS =
      " Systrarna@trancoffeelab.com , Winnie@trancoffeelab.com ";
    expect(isEmailAllowed("systrarna@trancoffeelab.com")).toBe(true);
    expect(isEmailAllowed("winnie@trancoffeelab.com")).toBe(true);
  });

  it("nekar en e-post som saknas i listan", () => {
    process.env.ALLOWED_ADMIN_EMAILS = "systrarna@trancoffeelab.com";
    expect(isEmailAllowed("okand@example.com")).toBe(false);
  });

  it("nekar null/undefined/tom sträng", () => {
    process.env.ALLOWED_ADMIN_EMAILS = "systrarna@trancoffeelab.com";
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    expect(isEmailAllowed("")).toBe(false);
  });

  it("nekar allt om ALLOWED_ADMIN_EMAILS är tom eller osatt", () => {
    delete process.env.ALLOWED_ADMIN_EMAILS;
    expect(isEmailAllowed("systrarna@trancoffeelab.com")).toBe(false);
  });
});

describe("getAllowedGoogleHd", () => {
  it("returnerar null om ALLOWED_GOOGLE_HD inte är satt", () => {
    delete process.env.ALLOWED_GOOGLE_HD;
    expect(getAllowedGoogleHd()).toBeNull();
  });

  it("returnerar null om ALLOWED_GOOGLE_HD bara innehåller mellanslag", () => {
    process.env.ALLOWED_GOOGLE_HD = "   ";
    expect(getAllowedGoogleHd()).toBeNull();
  });

  it("returnerar den trimmade domänen när satt", () => {
    process.env.ALLOWED_GOOGLE_HD = " trancoffeelab.com ";
    expect(getAllowedGoogleHd()).toBe("trancoffeelab.com");
  });
});

describe("resolveLoginRole", () => {
  it("gör en adress som bara står i kassalistan till kassabiträde, oavsett tidigare roll", () => {
    process.env.ALLOWED_ADMIN_EMAILS = "agare@example.com";
    process.env.ALLOWED_CASHIER_EMAILS = " Mamma@Example.com ";
    expect(isCashierEmail("mamma@example.com")).toBe(true);
    expect(resolveLoginRole("mamma@example.com", null)).toBe("cashier");
    expect(resolveLoginRole("mamma@example.com", "staff")).toBe("cashier");
  });

  it("låter ägare och personal behålla sin roll och lyfter ett kassabiträde som flyttats till admin-listan", () => {
    process.env.ALLOWED_ADMIN_EMAILS = "agare@example.com,erik@example.com";
    process.env.ALLOWED_CASHIER_EMAILS = "erik@example.com";
    expect(resolveLoginRole("agare@example.com", "owner")).toBeNull();
    expect(resolveLoginRole("agare@example.com", null)).toBeNull();
    expect(resolveLoginRole("erik@example.com", "cashier")).toBe("staff");
  });
});

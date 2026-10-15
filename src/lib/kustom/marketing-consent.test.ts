import { describe, expect, it } from "vitest";
import { hasMarketingConsent } from "./marketing-consent";

describe("hasMarketingConsent", () => {
  it("läser merchant_requested.additional_checkbox", () => {
    expect(hasMarketingConsent({ merchant_requested: { additional_checkbox: true } })).toBe(true);
    expect(hasMarketingConsent({ merchant_requested: { additional_checkbox: false } })).toBe(false);
  });

  it("läser även listformen additional_checkboxes", () => {
    expect(
      hasMarketingConsent({ merchant_requested: { additional_checkboxes: [{ id: "x", checked: true }] } }),
    ).toBe(true);
    expect(
      hasMarketingConsent({ merchant_requested: { additional_checkboxes: [{ id: "x", checked: false }] } }),
    ).toBe(false);
  });

  it("räknar saknad eller konstig data som nej", () => {
    expect(hasMarketingConsent(null)).toBe(false);
    expect(hasMarketingConsent({})).toBe(false);
    expect(hasMarketingConsent({ merchant_requested: { additional_checkbox: "true" } })).toBe(false);
  });
});

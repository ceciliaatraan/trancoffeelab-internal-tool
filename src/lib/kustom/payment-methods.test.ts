import { describe, expect, it } from "vitest";
import { isPayNowMethod } from "./payment-methods";

describe("isPayNowMethod", () => {
  it("debiterar direkt för kort, plånböcker och Swish", () => {
    for (const type of ["CARD", "APPLE_PAY_CARD", "GOOGLE_PAY_CARD", "SWISH", "PAY_BY_CARD"]) {
      expect(isPayNowMethod(type)).toBe(true);
    }
  });

  it("väntar för Klarnas betala-senare-sätt och allt okänt", () => {
    for (const type of ["INVOICE", "INVOICE_BUSINESS", "PAY_LATER_IN_PARTS", "FIXED_AMOUNT", "OTHER", "NÅGOT_NYTT"]) {
      expect(isPayNowMethod(type)).toBe(false);
    }
    expect(isPayNowMethod(undefined)).toBe(false);
    expect(isPayNowMethod(null)).toBe(false);
    expect(isPayNowMethod("")).toBe(false);
  });
});

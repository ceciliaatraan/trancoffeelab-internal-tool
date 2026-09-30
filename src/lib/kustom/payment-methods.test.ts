import { describe, expect, it } from "vitest";
import { isPayNowMethod, paymentMethodInfo } from "./payment-methods";

describe("isPayNowMethod", () => {
  it("debiterar direkt för kort, plånböcker och Swish", () => {
    for (const type of ["CARD", "APPLE_PAY_CARD", "GOOGLE_PAY_CARD", "SWISH", "PAY_BY_CARD", "DIRECT_DEBIT"]) {
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

describe("paymentMethodInfo", () => {
  it("ger läsbara etiketter som i Kustoms portal", () => {
    expect(paymentMethodInfo({ initial_payment_method: { type: "INVOICE", description: "Invoice" } })).toEqual({
      type: "INVOICE",
      label: "Klarna · Betala senare",
      payLater: true,
    });
    expect(paymentMethodInfo({ initial_payment_method: { type: "DIRECT_DEBIT" } })?.label).toBe(
      "Klarna · Betala nu",
    );
    expect(paymentMethodInfo({ initial_payment_method: { type: "APPLE_PAY_CARD" } })).toEqual({
      type: "APPLE_PAY_CARD",
      label: "Apple Pay",
      payLater: false,
    });
    expect(paymentMethodInfo({ initial_payment_method: { type: "INVOICE_BUSINESS" } })?.payLater).toBe(true);
  });

  it("faller tillbaka på Kustoms beskrivning för okända koder", () => {
    expect(
      paymentMethodInfo({ initial_payment_method: { type: "NÅGOT_NYTT", description: "Något nytt" } }),
    ).toEqual({ type: "NÅGOT_NYTT", label: "Något nytt", payLater: false });
  });

  it("returnerar null när betalsätt saknas", () => {
    expect(paymentMethodInfo(null)).toBeNull();
    expect(paymentMethodInfo({})).toBeNull();
    expect(paymentMethodInfo({ initial_payment_method: {} })).toBeNull();
  });
});

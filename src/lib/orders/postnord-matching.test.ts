import { describe, expect, it } from "vitest";
import {
  acceptsMatch,
  isHandedOverToPostnord,
  postnordLookupCandidates,
} from "./postnord-matching";

describe("isHandedOverToPostnord", () => {
  it("räknar bara EDI/fraktsedel som inte skickat", () => {
    expect(isHandedOverToPostnord({ status: "INFORMED", items: [] })).toBe(false);
    expect(isHandedOverToPostnord({ status: "CREATED", items: [] })).toBe(false);
    expect(isHandedOverToPostnord({ status: "OTHER", items: [] })).toBe(false);
    expect(isHandedOverToPostnord({ status: "NÅGOT_NYTT", items: [] })).toBe(false);
  });

  it("räknar paket på väg/framme som skickat", () => {
    expect(isHandedOverToPostnord({ status: "EN_ROUTE", items: [] })).toBe(true);
    expect(isHandedOverToPostnord({ status: "DELIVERED", items: [] })).toBe(true);
    expect(isHandedOverToPostnord({ status: "AVAILABLE_FOR_DELIVERY", items: [] })).toBe(true);
  });

  it("räcker att ett kolli är på väg", () => {
    expect(
      isHandedOverToPostnord({ status: "OTHER", items: [{ status: "INFORMED" }, { status: "EN_ROUTE" }] }),
    ).toBe(true);
  });
});

describe("postnordLookupCandidates", () => {
  const base = {
    orderNumber: 1064,
    kustomOrderId: "a3e97543-f8c8-259d-8e9d-fbcdcc0ddc51",
    labelTrackingNumber: null,
  };

  it("provar alla kända identifierare, i prioritetsordning", () => {
    const candidates = postnordLookupCandidates({
      ...base,
      labelTrackingNumber: "ECVZHHG5EVRRWFSJ",
      rawKustomOrder: {
        klarna_reference: "ABC123",
        selected_shipping_option: { tms_reference: "KS6LPXL50IPPGPB4ZN" },
        shipping_info: [{ tracking_number: "00370000000000000001" }],
      },
    });
    expect(candidates).toEqual([
      { value: "ECVZHHG5EVRRWFSJ", kind: "identifier", unique: true },
      { value: "00370000000000000001", kind: "identifier", unique: true },
      { value: "KS6LPXL50IPPGPB4ZN", kind: "identifier", unique: true },
      { value: "KS6LPXL50IPPGPB4ZN", kind: "reference", unique: true },
      { value: "a3e97543-f8c8-259d-8e9d-fbcdcc0ddc51", kind: "reference", unique: true },
      { value: "ABC123", kind: "reference", unique: true },
      { value: "TRAN #1064", kind: "reference", unique: false },
      { value: "1064", kind: "reference", unique: false },
    ]);
  });

  it("tål saknad/konstig rådata", () => {
    expect(postnordLookupCandidates({ ...base, rawKustomOrder: null }).map((c) => c.value)).toEqual([
      base.kustomOrderId,
      "TRAN #1064",
      "1064",
    ]);
    expect(
      postnordLookupCandidates({
        ...base,
        rawKustomOrder: { shipping_info: "nope", selected_shipping_option: { tms_reference: "" } },
      }),
    ).toHaveLength(3);
  });
});

describe("acceptsMatch", () => {
  const unique = { value: "x", kind: "reference" as const, unique: true };
  const weak = { value: "1064", kind: "reference" as const, unique: false };

  it("kräver samma postnummer när båda finns", () => {
    expect(acceptsMatch(unique, "113 51", "11351")).toBe(true);
    expect(acceptsMatch(unique, "11351", "41101")).toBe(false);
    expect(acceptsMatch(weak, "11351", "11351")).toBe(true);
  });

  it("godtar bara unika värden när postnummer saknas", () => {
    expect(acceptsMatch(unique, null, "11351")).toBe(true);
    expect(acceptsMatch(weak, null, "11351")).toBe(false);
    expect(acceptsMatch(weak, "11351", null)).toBe(false);
  });
});

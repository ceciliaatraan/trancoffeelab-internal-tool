import { describe, expect, it } from "vitest";
import { parseReservedOrderNumber } from "./reserved-order-number";

describe("parseReservedOrderNumber", () => {
  it("läser ett reserverat ordernummer", () => {
    expect(parseReservedOrderNumber("1340")).toBe(1340);
    expect(parseReservedOrderNumber(" 1340 ")).toBe(1340);
  });
  it("ignorerar allt som inte är ett av våra ordernummer", () => {
    for (const value of [undefined, null, "", "abc", "TRAN-1340", "999", "12.5", "1234567890"]) {
      expect(parseReservedOrderNumber(value)).toBeNull();
    }
  });
});

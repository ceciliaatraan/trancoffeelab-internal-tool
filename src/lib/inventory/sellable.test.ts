import { describe, expect, it } from "vitest";
import { BACKORDER_SELLABLE_QUANTITY, sellableQuantity } from "./sellable";

describe("sellableQuantity", () => {
  it("är fritt lager, aldrig under noll, utan minuslager", () => {
    expect(sellableQuantity({ quantity: 10, reservedQuantity: 3, shippedQuantity: 2, allowBackorder: false })).toBe(5);
    expect(sellableQuantity({ quantity: 2, reservedQuantity: 3, shippedQuantity: 1, allowBackorder: false })).toBe(0);
    expect(sellableQuantity({ quantity: null, reservedQuantity: null, shippedQuantity: null, allowBackorder: null })).toBe(0);
  });

  it("blockerar aldrig köp med minuslager påslaget, även när lagret är slut", () => {
    expect(sellableQuantity({ quantity: 2, reservedQuantity: 5, shippedQuantity: 0, allowBackorder: true })).toBe(
      BACKORDER_SELLABLE_QUANTITY,
    );
  });
});

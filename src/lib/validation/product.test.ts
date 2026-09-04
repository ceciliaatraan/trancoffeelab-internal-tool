import { describe, expect, it } from "vitest";
import { inventoryAdjustSchema, productInputSchema } from "./product";

const validInput = {
  slug: "no-regrets-horse",
  nameSv: "No Regrets Horse",
  nameEn: "No Regrets Horse",
  sku: "NRH-250",
  priceOre: 14900,
  taxRate: 1200,
  weightGrams: 250,
  status: "published" as const,
  sortOrder: 0,
};

describe("productInputSchema", () => {
  it("accepterar giltig indata", () => {
    expect(productInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("kräver tax_rate — tomt fält ska underkännas", () => {
    const rest: Partial<typeof validInput> = { ...validInput };
    delete rest.taxRate;
    expect(productInputSchema.safeParse(rest).success).toBe(false);
  });

  it("underkänner moms över 100%", () => {
    const result = productInputSchema.safeParse({ ...validInput, taxRate: 10001 });
    expect(result.success).toBe(false);
  });

  it("underkänner negativt pris", () => {
    const result = productInputSchema.safeParse({ ...validInput, priceOre: -1 });
    expect(result.success).toBe(false);
  });

  it("underkänner slug med versaler eller mellanslag", () => {
    expect(
      productInputSchema.safeParse({ ...validInput, slug: "No Regrets Horse" }).success,
    ).toBe(false);
  });

  it("accepterar slug med siffror och flera bindestreck", () => {
    expect(
      productInputSchema.safeParse({ ...validInput, slug: "phin-filter-2-pack" }).success,
    ).toBe(true);
  });
});

describe("inventoryAdjustSchema", () => {
  const validInventoryInput = {
    inventoryId: "123e4567-e89b-12d3-a456-426614174000",
    newQuantity: 42,
  };

  it("accepterar ett nytt lagersaldo utan orsak/anteckning", () => {
    expect(inventoryAdjustSchema.safeParse(validInventoryInput).success).toBe(true);
  });

  it("underkänner negativt lagersaldo", () => {
    expect(
      inventoryAdjustSchema.safeParse({ ...validInventoryInput, newQuantity: -1 }).success,
    ).toBe(false);
  });

  it("tom anteckning blir null i stället för ett tvingande fält", () => {
    const result = inventoryAdjustSchema.safeParse({ ...validInventoryInput, note: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });

  it("orsak används manual_adjustment som default när inget skickas", () => {
    const result = inventoryAdjustSchema.safeParse(validInventoryInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("manual_adjustment");
    }
  });
});

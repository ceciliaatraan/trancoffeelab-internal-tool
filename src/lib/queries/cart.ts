import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type ResolvedCartLine = {
  sku: string;
  nameSv: string;
  nameEn: string;
  priceOre: number;
  taxRate: number;
  weightGrams: number;
  available: number;
  productId: string;
  variantId: string | null;
  /** Alltid från produkten, aldrig från varianten — se src/db/schema/catalog.ts. */
  isPreorder: boolean;
  expectedShipDate: string | null;
};

async function resolveBaseProduct(sku: string): Promise<ResolvedCartLine | null> {
  const [row] = await db
    .select({
      productId: schema.products.id,
      nameSv: schema.products.nameSv,
      nameEn: schema.products.nameEn,
      priceOre: schema.products.priceOre,
      taxRate: schema.products.taxRate,
      weightGrams: schema.products.weightGrams,
      status: schema.products.status,
      isPreorder: schema.products.isPreorder,
      expectedShipDate: schema.products.expectedShipDate,
      quantity: schema.inventory.quantity,
      reservedQuantity: schema.inventory.reservedQuantity,
    })
    .from(schema.products)
    .leftJoin(
      schema.inventory,
      and(
        eq(schema.inventory.productId, schema.products.id),
        isNull(schema.inventory.variantId),
      ),
    )
    .where(and(eq(schema.products.sku, sku), eq(schema.products.status, "published")));

  if (!row) return null;

  return {
    sku,
    nameSv: row.nameSv,
    nameEn: row.nameEn,
    priceOre: row.priceOre,
    taxRate: row.taxRate,
    weightGrams: row.weightGrams,
    available: Math.max(0, (row.quantity ?? 0) - (row.reservedQuantity ?? 0)),
    productId: row.productId,
    variantId: null,
    isPreorder: row.isPreorder,
    expectedShipDate: row.expectedShipDate,
  };
}

async function resolveVariant(sku: string): Promise<ResolvedCartLine | null> {
  const [row] = await db
    .select({
      productId: schema.productVariants.productId,
      variantId: schema.productVariants.id,
      nameSv: schema.productVariants.nameSv,
      nameEn: schema.productVariants.nameEn,
      priceOre: schema.productVariants.priceOre,
      weightGrams: schema.productVariants.weightGrams,
      taxRate: schema.products.taxRate,
      status: schema.products.status,
      isPreorder: schema.products.isPreorder,
      expectedShipDate: schema.products.expectedShipDate,
      quantity: schema.inventory.quantity,
      reservedQuantity: schema.inventory.reservedQuantity,
    })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .leftJoin(schema.inventory, eq(schema.inventory.variantId, schema.productVariants.id))
    .where(and(eq(schema.productVariants.sku, sku), eq(schema.products.status, "published")));

  if (!row) return null;

  return {
    sku,
    nameSv: row.nameSv,
    nameEn: row.nameEn,
    priceOre: row.priceOre,
    taxRate: row.taxRate,
    weightGrams: row.weightGrams,
    available: Math.max(0, (row.quantity ?? 0) - (row.reservedQuantity ?? 0)),
    productId: row.productId,
    variantId: row.variantId,
    isPreorder: row.isPreorder,
    expectedShipDate: row.expectedShipDate,
  };
}

/** Slår upp en varukorgsrad på SKU — provar produkt, sedan variant. Priser/moms/lager kommer alltid härifrån, aldrig från klienten. */
export async function resolveCartLine(sku: string): Promise<ResolvedCartLine | null> {
  return (await resolveBaseProduct(sku)) ?? (await resolveVariant(sku));
}

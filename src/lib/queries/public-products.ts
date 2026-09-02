import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type PublicVariant = {
  sku: string;
  name: { sv: string; en: string };
  price: { amountOre: number; currency: "SEK" };
  weightGrams: number;
  inStock: boolean;
};

export type PublicProduct = {
  slug: string;
  sku: string;
  name: { sv: string; en: string };
  description: { sv: string | null; en: string | null };
  price: { amountOre: number; currency: "SEK" };
  taxRate: number;
  images: string[];
  weightGrams: number;
  inStock: boolean;
  variants: PublicVariant[];
};

function availableQuantity(quantity: number, reserved: number): number {
  return Math.max(0, quantity - reserved);
}

async function attachVariants(
  productIds: string[],
): Promise<Map<string, PublicVariant[]>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: schema.productVariants.productId,
      sku: schema.productVariants.sku,
      nameSv: schema.productVariants.nameSv,
      nameEn: schema.productVariants.nameEn,
      priceOre: schema.productVariants.priceOre,
      weightGrams: schema.productVariants.weightGrams,
      sortOrder: schema.productVariants.sortOrder,
      quantity: schema.inventory.quantity,
      reservedQuantity: schema.inventory.reservedQuantity,
    })
    .from(schema.productVariants)
    .leftJoin(
      schema.inventory,
      eq(schema.inventory.variantId, schema.productVariants.id),
    )
    .orderBy(asc(schema.productVariants.sortOrder));

  const byProduct = new Map<string, PublicVariant[]>();
  for (const row of rows) {
    if (!productIds.includes(row.productId)) continue;
    const list = byProduct.get(row.productId) ?? [];
    list.push({
      sku: row.sku,
      name: { sv: row.nameSv, en: row.nameEn },
      price: { amountOre: row.priceOre, currency: "SEK" },
      weightGrams: row.weightGrams,
      inStock: availableQuantity(row.quantity ?? 0, row.reservedQuantity ?? 0) > 0,
    });
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

function baseProductQuery() {
  return db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      sku: schema.products.sku,
      nameSv: schema.products.nameSv,
      nameEn: schema.products.nameEn,
      descriptionSv: schema.products.descriptionSv,
      descriptionEn: schema.products.descriptionEn,
      priceOre: schema.products.priceOre,
      taxRate: schema.products.taxRate,
      images: schema.products.images,
      weightGrams: schema.products.weightGrams,
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
    );
}

function toPublicProduct(
  row: Awaited<ReturnType<typeof baseProductQuery>>[number],
  variants: PublicVariant[],
): PublicProduct {
  return {
    slug: row.slug,
    sku: row.sku,
    name: { sv: row.nameSv, en: row.nameEn },
    description: { sv: row.descriptionSv, en: row.descriptionEn },
    price: { amountOre: row.priceOre, currency: "SEK" },
    taxRate: row.taxRate,
    images: row.images,
    weightGrams: row.weightGrams,
    inStock:
      variants.length > 0
        ? variants.some((variant) => variant.inStock)
        : availableQuantity(row.quantity ?? 0, row.reservedQuantity ?? 0) > 0,
    variants,
  };
}

export async function getPublishedProducts(): Promise<PublicProduct[]> {
  const rows = await baseProductQuery()
    .where(eq(schema.products.status, "published"))
    .orderBy(asc(schema.products.sortOrder));

  const variantsByProduct = await attachVariants(rows.map((row) => row.id));

  return rows.map((row) => toPublicProduct(row, variantsByProduct.get(row.id) ?? []));
}

export async function getPublishedProductBySlug(
  slug: string,
): Promise<PublicProduct | null> {
  const [row] = await baseProductQuery().where(
    and(eq(schema.products.slug, slug), eq(schema.products.status, "published")),
  );

  if (!row) return null;

  const variantsByProduct = await attachVariants([row.id]);
  return toPublicProduct(row, variantsByProduct.get(row.id) ?? []);
}

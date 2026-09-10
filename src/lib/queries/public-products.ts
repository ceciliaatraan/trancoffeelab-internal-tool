import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeBundleAvailability } from "@/lib/inventory/bundles";

/**
 * Publikt synliga statusar - inte bara "published". "coming_soon" visas
 * också (sneak peek), men är ALDRIG köpbar: resolveCartLine
 * (lib/queries/cart.ts) accepterar bara status="published", så en
 * coming_soon-produkt kan aldrig läggas i varukorgen eller checkoutas,
 * oavsett vad klienten skickar in.
 */
const PUBLICLY_VISIBLE_STATUSES = ["published", "coming_soon"] as const;

export type PublicVariant = {
  sku: string;
  name: { sv: string; en: string };
  price: { amountOre: number; currency: "SEK" };
  weightGrams: number;
  inStock: boolean;
  /** Alltid minst produktens egna bilder om varianten saknar egna - aldrig tom om produkten har någon bild. */
  images: string[];
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
  /** Alltid från produkten (aldrig varianten) - visas som "Beräknad leverans: ‹expectedShipDate›". */
  isPreorder: boolean;
  expectedShipDate: string | null;
  /** status="coming_soon" - synlig för sneak peek, men aldrig köpbar (se resolveCartLine). */
  comingSoon: boolean;
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
      images: schema.productVariants.images,
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
      images: row.images,
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
      isPreorder: schema.products.isPreorder,
      expectedShipDate: schema.products.expectedShipDate,
      status: schema.products.status,
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
  bundleAvailable: number | null,
): PublicProduct {
  // Variant utan egna bilder (t.ex. innan någon hunnit ladda upp ett
  // eget foto) visar produktens bilder istället för att stå helt tom.
  const variantsWithImages = variants.map((variant) => ({
    ...variant,
    images: variant.images.length > 0 ? variant.images : row.images,
  }));

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
      bundleAvailable !== null
        ? bundleAvailable > 0
        : variants.length > 0
          ? variants.some((variant) => variant.inStock)
          : availableQuantity(row.quantity ?? 0, row.reservedQuantity ?? 0) > 0,
    variants: variantsWithImages,
    isPreorder: row.isPreorder,
    expectedShipDate: row.expectedShipDate,
    comingSoon: row.status === "coming_soon",
  };
}

export async function getPublishedProducts(): Promise<PublicProduct[]> {
  const rows = await baseProductQuery()
    .where(inArray(schema.products.status, PUBLICLY_VISIBLE_STATUSES))
    .orderBy(asc(schema.products.sortOrder));

  const variantsByProduct = await attachVariants(rows.map((row) => row.id));
  const bundleAvailability = await Promise.all(
    rows.map((row) => computeBundleAvailability(db, row.id)),
  );

  return rows.map((row, index) =>
    toPublicProduct(row, variantsByProduct.get(row.id) ?? [], bundleAvailability[index]),
  );
}

export async function getPublishedProductBySlug(
  slug: string,
): Promise<PublicProduct | null> {
  const [row] = await baseProductQuery().where(
    and(eq(schema.products.slug, slug), inArray(schema.products.status, PUBLICLY_VISIBLE_STATUSES)),
  );

  if (!row) return null;

  const variantsByProduct = await attachVariants([row.id]);
  const bundleAvailable = await computeBundleAvailability(db, row.id);
  return toPublicProduct(row, variantsByProduct.get(row.id) ?? [], bundleAvailable);
}

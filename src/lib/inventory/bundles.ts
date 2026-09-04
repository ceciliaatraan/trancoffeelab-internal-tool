import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BundleItem = {
  bundleProductId: string;
  componentProductId: string;
  componentVariantId: string | null;
  quantity: number;
};

/** Alla kit-komponenter i hela katalogen, oavsett vilket kit de tillhör. */
export async function getAllBundleItems(dbOrTx: DbOrTx = db): Promise<BundleItem[]> {
  return dbOrTx
    .select({
      bundleProductId: schema.productBundleItems.bundleProductId,
      componentProductId: schema.productBundleItems.componentProductId,
      componentVariantId: schema.productBundleItems.componentVariantId,
      quantity: schema.productBundleItems.quantity,
    })
    .from(schema.productBundleItems);
}

/** Komponenterna för EN produkt — tom lista betyder att produkten inte är ett kit. */
export async function getBundleItemsForProduct(
  dbOrTx: DbOrTx,
  bundleProductId: string,
): Promise<BundleItem[]> {
  return dbOrTx
    .select({
      bundleProductId: schema.productBundleItems.bundleProductId,
      componentProductId: schema.productBundleItems.componentProductId,
      componentVariantId: schema.productBundleItems.componentVariantId,
      quantity: schema.productBundleItems.quantity,
    })
    .from(schema.productBundleItems)
    .where(eq(schema.productBundleItems.bundleProductId, bundleProductId));
}

/** Fysiskt saldo minus reserverat, per (produkt, variant), för en uppsättning lagerförda enheter. */
export async function getAvailabilityByKey(
  dbOrTx: DbOrTx,
  keys: { productId: string; variantId: string | null }[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;

  const productIds = [...new Set(keys.map((k) => k.productId))];
  const rows = await dbOrTx
    .select({
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      quantity: schema.inventory.quantity,
      reservedQuantity: schema.inventory.reservedQuantity,
    })
    .from(schema.inventory)
    .where(inArray(schema.inventory.productId, productIds));

  for (const row of rows) {
    map.set(
      `${row.productId}|${row.variantId ?? ""}`,
      Math.max(0, row.quantity - row.reservedQuantity),
    );
  }
  return map;
}

/** Hur många kompletta kit som går att sätta ihop just nu, utifrån komponenternas fria lager. */
export function computeBundleAvailableFromMap(
  items: BundleItem[],
  availabilityByKey: Map<string, number>,
): number {
  if (items.length === 0) return 0;
  const possibleByComponent = items.map((item) => {
    const key = `${item.componentProductId}|${item.componentVariantId ?? ""}`;
    const available = availabilityByKey.get(key) ?? 0;
    return Math.floor(available / item.quantity);
  });
  return Math.max(0, Math.min(...possibleByComponent));
}

/**
 * Tillgängligt antal för EN kit-produkt. Returnerar null om produkten
 * inte är ett kit (inga rader i product_bundle_items), så anroparen kan
 * falla tillbaka på produktens egna lagersaldo.
 */
export async function computeBundleAvailability(
  dbOrTx: DbOrTx,
  bundleProductId: string,
): Promise<number | null> {
  const items = await getBundleItemsForProduct(dbOrTx, bundleProductId);
  if (items.length === 0) return null;

  const availabilityByKey = await getAvailabilityByKey(
    dbOrTx,
    items.map((item) => ({
      productId: item.componentProductId,
      variantId: item.componentVariantId,
    })),
  );
  return computeBundleAvailableFromMap(items, availabilityByKey);
}

export type InventoryTarget = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

/**
 * Expanderar en orderrad till de konkreta lagerrader som ska justeras.
 * En kit-rad sprids ut på sina komponenter (kvantitet per kit gånger
 * antal beställda kit) — kitets egen lagerrad rörs aldrig. En vanlig
 * rad pekar direkt på sin egen lagerrad, precis som tidigare.
 */
export async function expandLineToInventoryTargets(
  dbOrTx: DbOrTx,
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<InventoryTarget[]> {
  if (variantId) {
    return [{ productId, variantId, quantity }];
  }

  const items = await getBundleItemsForProduct(dbOrTx, productId);
  if (items.length === 0) {
    return [{ productId, variantId: null, quantity }];
  }

  return items.map((item) => ({
    productId: item.componentProductId,
    variantId: item.componentVariantId,
    quantity: quantity * item.quantity,
  }));
}

import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAllBundleItems } from "./bundles";

export type BundleComponentStatus = {
  name: string;
  available: number;
  quantityPerBundle: number;
};

export type InventoryOverviewRow = {
  inventoryId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  reservedQuantity: number;
  alarmLevel: number;
  isBundle: boolean;
  /** "I lager": rå kvantitet för vanliga rader, komponent-beräknat antal kit för bundlar. */
  available: number;
  bundleBreakdown: BundleComponentStatus[] | null;
};

/**
 * All lagerdata i katalogen, en rad per lagerförd enhet — bundlar (t.ex.
 * Komplett Kit) får sitt "I lager"-värde beräknat från komponenternas
 * fria lager i stället för sin egen (numera oanvända) lagerrad. Delas av
 * /inventory-sidan och dashboardens "under larmnivå"-widget så de aldrig
 * kan råka räkna olika.
 */
export async function getInventoryOverview(): Promise<InventoryOverviewRow[]> {
  const rows = await db
    .select({
      inventoryId: schema.inventory.id,
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      quantity: schema.inventory.quantity,
      reservedQuantity: schema.inventory.reservedQuantity,
      alarmLevel: schema.inventory.alarmLevel,
      productName: schema.products.nameSv,
      productSku: schema.products.sku,
      variantName: schema.productVariants.nameSv,
      variantSku: schema.productVariants.sku,
    })
    .from(schema.inventory)
    .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
    .leftJoin(
      schema.productVariants,
      eq(schema.inventory.variantId, schema.productVariants.id),
    )
    .orderBy(asc(schema.products.nameSv));

  const bundleItems = await getAllBundleItems(db);
  const bundlesByProduct = new Map<string, typeof bundleItems>();
  for (const item of bundleItems) {
    const list = bundlesByProduct.get(item.bundleProductId) ?? [];
    list.push(item);
    bundlesByProduct.set(item.bundleProductId, list);
  }

  const rowByKey = new Map(rows.map((row) => [`${row.productId}|${row.variantId ?? ""}`, row]));

  return rows.map((row) => {
    const components = row.variantId ? undefined : bundlesByProduct.get(row.productId);

    if (!components || components.length === 0) {
      return {
        inventoryId: row.inventoryId,
        productId: row.productId,
        variantId: row.variantId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.variantSku ?? row.productSku,
        quantity: row.quantity,
        reservedQuantity: row.reservedQuantity,
        alarmLevel: row.alarmLevel,
        isBundle: false,
        available: row.quantity,
        bundleBreakdown: null,
      };
    }

    const breakdown: BundleComponentStatus[] = components.map((item) => {
      const componentRow = rowByKey.get(
        `${item.componentProductId}|${item.componentVariantId ?? ""}`,
      );
      const available = componentRow
        ? Math.max(0, componentRow.quantity - componentRow.reservedQuantity)
        : 0;
      const name = componentRow
        ? componentRow.variantName
          ? `${componentRow.productName} — ${componentRow.variantName}`
          : componentRow.productName
        : "Okänd komponent";
      return { name, available, quantityPerBundle: item.quantity };
    });

    const available = Math.max(
      0,
      Math.min(...breakdown.map((c) => Math.floor(c.available / c.quantityPerBundle))),
    );

    return {
      inventoryId: row.inventoryId,
      productId: row.productId,
      variantId: row.variantId,
      productName: row.productName,
      variantName: row.variantName,
      sku: row.variantSku ?? row.productSku,
      quantity: row.quantity,
      reservedQuantity: row.reservedQuantity,
      alarmLevel: row.alarmLevel,
      isBundle: true,
      available,
      bundleBreakdown: breakdown,
    };
  });
}

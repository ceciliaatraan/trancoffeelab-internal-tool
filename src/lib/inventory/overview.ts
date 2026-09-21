import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAllBundleItems } from "./bundles";
import { computeTrueReservedQuantities, computeTrueShippedQuantities } from "./order-line-totals";

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
  /** "I lager": ursprungslager, satt ENDAST av admin (Justera/Ny leverans) - ändras aldrig automatiskt av ordersystemet, se schema/catalog.ts. */
  quantity: number;
  /** Alltid det VERKLIGA antalet öppna ordrar just nu (se order-line-totals.ts) - inte den ackumulerade inventory.reserved_quantity-kolumnen, som bara används internt för butikens snabba lagerkoll i kassan. */
  reservedQuantity: number;
  alarmLevel: number;
  isBundle: boolean;
  /** Samma som `quantity` för vanliga rader, komponent-beräknat antal kit för bundlar (som redan drar ifrån komponenternas reserverat OCH skickat, se bundles.ts). */
  available: number;
  /**
   * Totalt skickat/levererat genom tiderna - alltid det VERKLIGA antalet
   * räknat direkt från ordrar med fulfillment_status = shipped (se
   * order-line-totals.ts), inte den ackumulerade inventory.shipped_
   * quantity-kolumnen (som bara används internt för kassan, av samma
   * skäl som reserved_quantity ovan).
   */
  shippedQuantity: number;
  /**
   * "Tillgängligt": hur många som är fria att sälja RIGHT NOW - I lager
   * minus Reserverat minus Skickat. Beräknas automatiskt, aldrig satt
   * manuellt. Bundlar visar "-" här (samma som Reserverat/Skickat), för
   * "I lager" på en kit-rad är redan det komponent-beräknade antalet,
   * som redan tar hänsyn till komponenternas reserverat/skickat.
   */
  sellableQuantity: number | null;
  bundleBreakdown: BundleComponentStatus[] | null;
};

/**
 * All lagerdata i katalogen, en rad per lagerförd enhet - bundlar (t.ex.
 * Komplett Kit) får sitt "I lager"-värde beräknat från komponenternas
 * fria lager i stället för sin egen (numera oanvända) lagerrad. Delas av
 * /inventory-sidan och dashboardens "under larmnivå"-widget så de aldrig
 * kan råka räkna olika.
 *
 * Reserverat/Skickat visas alltid som det VERKLIGA antalet räknat direkt
 * från ordrarna (order-line-totals.ts), oavsett om den ackumulerade
 * inventory.reserved_quantity-kolumnen råkat hamna fel - den kolumnen
 * används bara internt för butikens egen snabba lagerkoll i kassan
 * (se lib/queries/cart.ts), inte för vad som visas här.
 *
 * En produkts EGEN (variant-lösa) lagerrad visas ALDRIG här om
 * produkten har konfigurerade varianter (t.ex. "No Regrets Horse" med
 * "Malet kaffe"/"Kaffebönor") - ingen kund kan köpa produkten utan att
 * välja en variant (se toPublicProduct i public-products.ts, som redan
 * ignorerar den raden helt), så den är bara förvirrande dubbeldata på
 * lagersidan. Den underliggande inventory-raden finns kvar i databasen
 * (variant-tabellen är beroende av produktraden), den filtreras bara
 * bort härifrån.
 */
export async function getInventoryOverview(): Promise<InventoryOverviewRow[]> {
  const rows = await db
    .select({
      inventoryId: schema.inventory.id,
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      quantity: schema.inventory.quantity,
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

  const [trueReserved, trueShipped] = await Promise.all([
    computeTrueReservedQuantities(),
    computeTrueShippedQuantities(),
  ]);

  const bundleItems = await getAllBundleItems(db);
  const bundlesByProduct = new Map<string, typeof bundleItems>();
  for (const item of bundleItems) {
    const list = bundlesByProduct.get(item.bundleProductId) ?? [];
    list.push(item);
    bundlesByProduct.set(item.bundleProductId, list);
  }

  const rowByKey = new Map(rows.map((row) => [`${row.productId}|${row.variantId ?? ""}`, row]));

  const variantProductIds = new Set(
    rows.filter((row) => row.variantId !== null).map((row) => row.productId),
  );

  return rows.flatMap((row): InventoryOverviewRow[] => {
    const hasVariants = !row.variantId && variantProductIds.has(row.productId);
    if (hasVariants) return [];

    const key = `${row.productId}|${row.variantId ?? ""}`;
    const reservedQuantity = trueReserved.get(key) ?? 0;
    const shippedQuantity = trueShipped.get(key) ?? 0;
    const components = row.variantId ? undefined : bundlesByProduct.get(row.productId);

    if (!components || components.length === 0) {
      return [
        {
          inventoryId: row.inventoryId,
          productId: row.productId,
          variantId: row.variantId,
          productName: row.productName,
          variantName: row.variantName,
          sku: row.variantSku ?? row.productSku,
          quantity: row.quantity,
          reservedQuantity,
          alarmLevel: row.alarmLevel,
          isBundle: false,
          available: row.quantity,
          shippedQuantity,
          sellableQuantity: Math.max(0, row.quantity - reservedQuantity - shippedQuantity),
          bundleBreakdown: null,
        },
      ];
    }

    const breakdown: BundleComponentStatus[] = components.map((item) => {
      const componentRow = rowByKey.get(
        `${item.componentProductId}|${item.componentVariantId ?? ""}`,
      );
      const componentKey = `${item.componentProductId}|${item.componentVariantId ?? ""}`;
      const available = componentRow
        ? Math.max(
            0,
            componentRow.quantity -
              (trueReserved.get(componentKey) ?? 0) -
              (trueShipped.get(componentKey) ?? 0),
          )
        : 0;
      const name = componentRow
        ? componentRow.variantName
          ? `${componentRow.productName} - ${componentRow.variantName}`
          : componentRow.productName
        : "Okänd komponent";
      return { name, available, quantityPerBundle: item.quantity };
    });

    const available = Math.max(
      0,
      Math.min(...breakdown.map((c) => Math.floor(c.available / c.quantityPerBundle))),
    );

    return [
      {
        inventoryId: row.inventoryId,
        productId: row.productId,
        variantId: row.variantId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.variantSku ?? row.productSku,
        quantity: row.quantity,
        reservedQuantity,
        alarmLevel: row.alarmLevel,
        isBundle: true,
        available,
        shippedQuantity,
        sellableQuantity: null,
        bundleBreakdown: breakdown,
      },
    ];
  });
}

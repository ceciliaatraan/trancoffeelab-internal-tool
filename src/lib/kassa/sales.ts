import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import { notifyPosSaleInSlack } from "@/lib/notifications/slack";
import { buildSaleLines, type KassaItem } from "./sale-lines";
import type { PosLocation, PosPaymentMethod } from "./options";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Seller = { id: string; email: string };

/**
 * Allt som går att sälja i kassan: publicerade produkter (inte kommande,
 * utkast eller arkiverade). En produkt med varianter säljs per variant.
 */
export async function getKassaCatalog(): Promise<KassaItem[]> {
  const [products, variants] = await Promise.all([
    db
      .select({
        id: schema.products.id,
        sku: schema.products.sku,
        name: schema.products.nameSv,
        priceOre: schema.products.priceOre,
        taxRate: schema.products.taxRate,
      })
      .from(schema.products)
      .where(eq(schema.products.status, "published"))
      .orderBy(asc(schema.products.sortOrder), asc(schema.products.nameSv)),
    db
      .select({
        id: schema.productVariants.id,
        productId: schema.productVariants.productId,
        sku: schema.productVariants.sku,
        name: schema.productVariants.nameSv,
        priceOre: schema.productVariants.priceOre,
      })
      .from(schema.productVariants)
      .orderBy(asc(schema.productVariants.sortOrder), asc(schema.productVariants.nameSv)),
  ]);

  return products.flatMap((product): KassaItem[] => {
    const own = variants.filter((variant) => variant.productId === product.id);
    if (own.length === 0) {
      return [
        {
          sku: product.sku,
          productId: product.id,
          variantId: null,
          name: product.name,
          priceOre: product.priceOre,
          taxRate: product.taxRate,
        },
      ];
    }
    return own.map((variant) => ({
      sku: variant.sku,
      productId: product.id,
      variantId: variant.id,
      name: `${product.name} - ${variant.name}`,
      priceOre: variant.priceOre,
      taxRate: product.taxRate,
    }));
  });
}

/**
 * Skapar en försäljning som väntar på betalning ("pending") - när QR-koden
 * visas, så Swish-meddelandet kan bära försäljningens nummer. Lagret rörs
 * först när den markeras som betald.
 */
export async function createPendingSale(input: {
  requested: { sku: string; quantity: number }[];
  location: PosLocation;
  note: string | null;
  paymentMethod: PosPaymentMethod;
  seller: Seller;
}): Promise<{ id: string; saleNumber: number; totalOre: number }> {
  const sale = buildSaleLines(await getKassaCatalog(), input.requested);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.posSales)
      .values({
        status: "pending",
        location: input.location,
        note: input.note,
        paymentMethod: input.paymentMethod,
        totalOre: sale.totalOre,
        taxOre: sale.taxOre,
        soldByAdminId: input.seller.id,
        soldByEmail: input.seller.email,
      })
      .returning({ id: schema.posSales.id, saleNumber: schema.posSales.saleNumber });

    await tx.insert(schema.posSaleLines).values(
      sale.lines.map((line) => ({
        saleId: created.id,
        productId: line.productId,
        variantId: line.variantId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPriceOre: line.unitPriceOre,
        taxRate: line.taxRate,
        totalOre: line.totalOre,
      })),
    );

    return { id: created.id, saleNumber: created.saleNumber, totalOre: sale.totalOre };
  });
}

/**
 * Drar en såld rad från "I lager" (quantity) - ett kit från sina
 * komponenter - och sparar lagerrörelsen med orsak pos_sale och
 * försäljningens id, så den kan läggas tillbaka exakt vid ångring. Rör
 * aldrig reserverat/skickat: de räknas om från webbshopens ordrar (se
 * reconcileReservedQuantitiesAction).
 */
async function removeLineFromStock(
  tx: Tx,
  line: { productId: string | null; variantId: string | null; quantity: number; name: string },
  sale: { id: string; saleNumber: number },
  sellerId: string,
): Promise<void> {
  if (!line.productId) return;
  const targets = await expandLineToInventoryTargets(tx, line.productId, line.variantId, line.quantity);
  for (const target of targets) {
    const condition = target.variantId
      ? and(
          eq(schema.inventory.productId, target.productId),
          eq(schema.inventory.variantId, target.variantId),
        )
      : and(eq(schema.inventory.productId, target.productId), isNull(schema.inventory.variantId));
    const [row] = await tx.select({ id: schema.inventory.id }).from(schema.inventory).where(condition).for("update");
    if (!row) continue;

    await tx
      .update(schema.inventory)
      .set({ quantity: sql`${schema.inventory.quantity} - ${target.quantity}`, updatedAt: new Date() })
      .where(eq(schema.inventory.id, row.id));
    await tx.insert(schema.inventoryMovements).values({
      inventoryId: row.id,
      changeAmount: -target.quantity,
      reason: "pos_sale",
      posSaleId: sale.id,
      note:
        target.productId === line.productId
          ? `Kassa #${sale.saleNumber}`
          : `Kassa #${sale.saleNumber} (komponent i "${line.name}")`,
      causedByAdminId: sellerId,
    });
  }
}

/**
 * Markerar en väntande försäljning som betald: drar lagret och skickar
 * Slack-notisen. Bara pending → paid (villkorad uppdatering), så ett
 * dubbeltryck aldrig drar lagret två gånger. Returnerar false om
 * försäljningen inte längre väntar.
 */
export async function markSalePaid(saleId: string, seller: Seller): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    const [sale] = await tx
      .update(schema.posSales)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(schema.posSales.id, saleId), eq(schema.posSales.status, "pending")))
      .returning();
    if (!sale) return null;

    const lines = await tx.select().from(schema.posSaleLines).where(eq(schema.posSaleLines.saleId, saleId));
    for (const line of lines) {
      await removeLineFromStock(tx, line, sale, seller.id);
    }
    return { sale, lines };
  });
  if (!result) return false;

  await notifyPosSaleInSlack({
    saleNumber: result.sale.saleNumber,
    totalOre: result.sale.totalOre,
    location: result.sale.location,
    note: result.sale.note,
    paymentMethod: result.sale.paymentMethod,
    soldByEmail: result.sale.soldByEmail,
    lines: result.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
  });
  return true;
}

/** Avbryter en försäljning som inte betalats (kunden ångrade sig vid QR-koden). */
export async function cancelPendingSale(saleId: string): Promise<boolean> {
  const [sale] = await db
    .update(schema.posSales)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(schema.posSales.id, saleId), eq(schema.posSales.status, "pending")))
    .returning({ id: schema.posSales.id });
  return Boolean(sale);
}

/**
 * Ångrar en betald försäljning (fel knapptryck, vara som lämnats tillbaka):
 * lägger tillbaka exakt det lager försäljningen drog. Pengarna betalas
 * tillbaka för hand i Swish-appen - inget skickas till Swish härifrån.
 */
export async function refundSale(saleId: string, seller: Seller): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .update(schema.posSales)
      .set({ status: "refunded", cancelledAt: new Date() })
      .where(and(eq(schema.posSales.id, saleId), eq(schema.posSales.status, "paid")))
      .returning({ id: schema.posSales.id, saleNumber: schema.posSales.saleNumber });
    if (!sale) return false;

    const movements = await tx
      .select()
      .from(schema.inventoryMovements)
      .where(
        and(eq(schema.inventoryMovements.posSaleId, saleId), eq(schema.inventoryMovements.reason, "pos_sale")),
      );
    for (const movement of movements) {
      if (movement.changeAmount >= 0) continue;
      await tx
        .update(schema.inventory)
        .set({ quantity: sql`${schema.inventory.quantity} + ${-movement.changeAmount}`, updatedAt: new Date() })
        .where(eq(schema.inventory.id, movement.inventoryId));
      await tx.insert(schema.inventoryMovements).values({
        inventoryId: movement.inventoryId,
        changeAmount: -movement.changeAmount,
        reason: "pos_sale",
        posSaleId: saleId,
        note: `Kassa #${sale.saleNumber} ångrad`,
        causedByAdminId: seller.id,
      });
    }
    return true;
  });
}

export type RecentPosSale = {
  id: string;
  saleNumber: number;
  status: string;
  location: string;
  note: string | null;
  paymentMethod: string;
  totalOre: number;
  soldByEmail: string | null;
  createdAt: Date;
  lines: { name: string; quantity: number }[];
};

/** De senaste försäljningarna (inte avbrutna), nyast först. */
export async function getRecentSales(limit: number): Promise<RecentPosSale[]> {
  const sales = await db
    .select()
    .from(schema.posSales)
    .where(inArray(schema.posSales.status, ["paid", "refunded", "pending"]))
    .orderBy(desc(schema.posSales.createdAt))
    .limit(limit);
  if (sales.length === 0) return [];

  const lines = await db
    .select({
      saleId: schema.posSaleLines.saleId,
      name: schema.posSaleLines.name,
      quantity: schema.posSaleLines.quantity,
    })
    .from(schema.posSaleLines)
    .where(inArray(schema.posSaleLines.saleId, sales.map((sale) => sale.id)));

  return sales.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: sale.status,
    location: sale.location,
    note: sale.note,
    paymentMethod: sale.paymentMethod,
    totalOre: sale.totalOre,
    soldByEmail: sale.soldByEmail,
    createdAt: sale.createdAt,
    lines: lines.filter((line) => line.saleId === sale.id),
  }));
}

/**
 * Betald kassaförsäljning per plats (i öre) för innevarande dag eller
 * månad i svensk tid - gränsen räknas i databasen, oberoende av serverns
 * tidszon.
 */
export async function getPaidTotalsByLocation(period: "day" | "month"): Promise<Map<string, number>> {
  const unit = sql.raw(period === "day" ? "'day'" : "'month'");
  const rows = await db
    .select({
      location: schema.posSales.location,
      totalOre: sql<number>`coalesce(sum(${schema.posSales.totalOre}), 0)::int`,
    })
    .from(schema.posSales)
    .where(
      and(
        eq(schema.posSales.status, "paid"),
        sql`date_trunc(${unit}, ${schema.posSales.paidAt} at time zone 'Europe/Stockholm') = date_trunc(${unit}, now() at time zone 'Europe/Stockholm')`,
      ),
    )
    .groupBy(schema.posSales.location);
  return new Map(rows.map((row) => [row.location, Number(row.totalOre)]));
}

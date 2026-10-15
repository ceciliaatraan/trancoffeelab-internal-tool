import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";
import { notifyPosSaleInSlack } from "@/lib/notifications/slack";
import { sendReceiptEmail } from "@/lib/email/pos-receipt";
import { buildSaleLines, type KassaItem } from "./sale-lines";
import type { PosPaymentMethod } from "./options";
import type { PosLocation } from "./locations";

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

/** Trimmar och kontrollerar kundens e-post - kastar med ett begripligt fel om den inte ser giltig ut. */
export function normalizeCustomerEmail(raw: string): string {
  const email = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Skriv kundens e-postadress.");
  }
  return email;
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
  /** Krävs - frågas efter innan Swish-koden visas. */
  customerEmail: string;
  seller: Seller;
}): Promise<{ id: string; saleNumber: number; totalOre: number; customerEmail: string }> {
  const customerEmail = normalizeCustomerEmail(input.customerEmail);
  const sale = buildSaleLines(await getKassaCatalog(), input.requested);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.posSales)
      .values({
        status: "pending",
        locationId: input.location.id,
        location: input.location.name,
        note: input.note,
        paymentMethod: input.paymentMethod,
        totalOre: sale.totalOre,
        taxOre: sale.taxOre,
        soldByAdminId: input.seller.id,
        soldByEmail: input.seller.email,
        customerEmail,
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

    return { id: created.id, saleNumber: created.saleNumber, totalOre: sale.totalOre, customerEmail };
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
export async function markSalePaid(
  saleId: string,
  seller: Seller,
  /** Valfritt, inskrivet av kassabiträdet - Swish Företag ger oss inte betalarens namn. */
  customerName: string | null = null,
): Promise<boolean> {
  const name = customerName?.replace(/\s+/g, " ").trim().slice(0, 100) || null;
  const result = await db.transaction(async (tx) => {
    const [sale] = await tx
      .update(schema.posSales)
      .set({ status: "paid", paidAt: new Date(), customerName: name })
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
    customerName: result.sale.customerName,
    customerEmail: result.sale.customerEmail,
    lines: result.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
  });
  return true;
}

/** Kunden ville inte ha kvitto - sparas så det syns i listan (ändras om ett kvitto skickas senare). */
export async function declineSaleReceipt(saleId: string): Promise<void> {
  await db
    .update(schema.posSales)
    .set({ receiptRequested: false })
    .where(and(eq(schema.posSales.id, saleId), isNull(schema.posSales.receiptSentAt)));
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
  customerName: string | null;
  customerEmail: string | null;
  /** true = kvitto skickat, false = kunden ville inte ha kvitto, null = inte frågat. */
  receiptRequested: boolean | null;
  receiptEmail: string | null;
  createdAt: Date;
  lines: { name: string; quantity: number }[];
};

/**
 * De senaste försäljningarna (inte avbrutna), nyast först - bara ett ställes
 * om `locationId` anges (den som har ett fast ställe ser bara sina egna).
 */
export async function getRecentSales(limit: number, locationId?: string): Promise<RecentPosSale[]> {
  const sales = await db
    .select()
    .from(schema.posSales)
    .where(
      and(
        inArray(schema.posSales.status, ["paid", "refunded", "pending"]),
        locationId ? eq(schema.posSales.locationId, locationId) : undefined,
      ),
    )
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
    customerName: sale.customerName,
    customerEmail: sale.customerEmail,
    receiptRequested: sale.receiptRequested,
    receiptEmail: sale.receiptSentAt ? sale.receiptEmail : null,
    createdAt: sale.createdAt,
    lines: lines.filter((line) => line.saleId === sale.id),
  }));
}


/**
 * Skickar kvittot för en betald försäljning till kundens e-post och sparar
 * vart det skickades. Kan göras om (t.ex. fel adress första gången). Adressen
 * sparas bara på försäljningen - kunden läggs inte till i kundregistret
 * eller på någon utskickslista.
 */
export async function sendSaleReceipt(saleId: string, rawEmail: string): Promise<{ email: string }> {
  const email = normalizeCustomerEmail(rawEmail);

  const [sale] = await db.select().from(schema.posSales).where(eq(schema.posSales.id, saleId));
  if (!sale || sale.status !== "paid" || !sale.paidAt) {
    throw new Error("Kvitto kan bara skickas för betalda försäljningar.");
  }

  const lines = await db
    .select({
      name: schema.posSaleLines.name,
      quantity: schema.posSaleLines.quantity,
      lineTotalOre: schema.posSaleLines.totalOre,
      taxRate: schema.posSaleLines.taxRate,
      slug: schema.products.slug,
      productImages: schema.products.images,
      variantImages: schema.productVariants.images,
    })
    .from(schema.posSaleLines)
    .leftJoin(schema.products, eq(schema.posSaleLines.productId, schema.products.id))
    .leftJoin(schema.productVariants, eq(schema.posSaleLines.variantId, schema.productVariants.id))
    .where(eq(schema.posSaleLines.saleId, saleId));

  await sendReceiptEmail({
    to: email,
    saleNumber: sale.saleNumber,
    paidAt: sale.paidAt,
    location: sale.location,
    totalOre: sale.totalOre,
    lines: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      lineTotalOre: line.lineTotalOre,
      taxRate: line.taxRate,
      slug: line.slug,
      imageUrl: line.variantImages?.[0] ?? line.productImages?.[0] ?? null,
    })),
  });

  await db
    .update(schema.posSales)
    .set({ receiptEmail: email, receiptSentAt: new Date(), receiptRequested: true })
    .where(eq(schema.posSales.id, saleId));
  return { email };
}

import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

export type StockBatchLine = {
  inventoryId: string;
  productName: string;
  variantName: string | null;
  receivedQuantity: number;
};

export type StockBatch = {
  /** Anteckningen från receiveBatchAction/adjustInventory, t.ex. "Ny leverans: Batch 2 - fler Phin". */
  note: string | null;
  createdAt: Date;
  lines: StockBatchLine[];
};

/**
 * Senaste manuella lagerökningarna (leveranser/batcher registrerade via
 * receiveBatchAction, eller enstaka Justera-uppräkningar), grupperade
 * till "batcher". Ingen egen batch-tabell behövs: alla rader som
 * receiveBatchAction skapar för EN leverans delar exakt samma
 * anteckning och exakt samma createdAt (samma databastransaktion, så
 * `now()` blir identisk för varje rad) - så gruppering på (note,
 * createdAt) är ett exakt, inte ungefärligt, sätt att återskapa
 * batchen. Visar VAD som kom in och NÄR - inte hur mycket som är kvar
 * just från den batchen specifikt (det kräver riktig lot-spårning per
 * försändelse, vilket ägaren avböjde 2026-09-21 till förmån för den
 * här enklare, migrationsfria vyn).
 */
export async function getRecentStockBatches(limit = 15): Promise<StockBatch[]> {
  const rows = await db
    .select({
      inventoryId: schema.inventoryMovements.inventoryId,
      productName: schema.products.nameSv,
      variantName: schema.productVariants.nameSv,
      changeAmount: schema.inventoryMovements.changeAmount,
      note: schema.inventoryMovements.note,
      createdAt: schema.inventoryMovements.createdAt,
    })
    .from(schema.inventoryMovements)
    .innerJoin(schema.inventory, eq(schema.inventory.id, schema.inventoryMovements.inventoryId))
    .innerJoin(schema.products, eq(schema.products.id, schema.inventory.productId))
    .leftJoin(
      schema.productVariants,
      eq(schema.productVariants.id, schema.inventory.variantId),
    )
    .where(
      and(
        eq(schema.inventoryMovements.reason, "manual_adjustment"),
        gt(schema.inventoryMovements.changeAmount, 0),
      ),
    )
    .orderBy(desc(schema.inventoryMovements.createdAt))
    .limit(200);

  const batchesByKey = new Map<string, StockBatch>();
  for (const row of rows) {
    const key = `${row.note ?? ""}|${row.createdAt.toISOString()}`;
    const batch = batchesByKey.get(key) ?? { note: row.note, createdAt: row.createdAt, lines: [] };
    batch.lines.push({
      inventoryId: row.inventoryId,
      productName: row.productName,
      variantName: row.variantName,
      receivedQuantity: row.changeAmount,
    });
    batchesByKey.set(key, batch);
  }

  return [...batchesByKey.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

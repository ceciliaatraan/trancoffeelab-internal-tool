import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

export type StockReceiptRow = {
  productName: string;
  variantName: string | null;
  changeAmount: number;
  note: string | null;
  createdAt: Date;
};

/**
 * Senaste manuella lagerökningarna (batcher/leveranser registrerade via
 * receiveBatchAction, eller vanlig Justera-uppräkning) - rent
 * referensvyn på /inventory/batch så man kan se att en leverans faktiskt
 * registrerades, utan en egen "batcher"-tabell.
 */
export async function getRecentStockReceipts(limit = 30): Promise<StockReceiptRow[]> {
  const rows = await db
    .select({
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
    .limit(limit);

  return rows;
}

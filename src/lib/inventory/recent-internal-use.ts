import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type InternalUseEntry = {
  id: string;
  productName: string;
  variantName: string | null;
  /** Positivt antal som togs ut (lagerrörelsens changeAmount är negativt). */
  quantity: number;
  note: string | null;
  createdAt: Date;
};

/** Senaste egna uttagen ur lagret (orsak internal_use, utan order), nyast först. */
export async function getRecentInternalUse(limit = 20): Promise<InternalUseEntry[]> {
  const rows = await db
    .select({
      id: schema.inventoryMovements.id,
      productName: schema.products.nameSv,
      variantName: schema.productVariants.nameSv,
      changeAmount: schema.inventoryMovements.changeAmount,
      note: schema.inventoryMovements.note,
      createdAt: schema.inventoryMovements.createdAt,
    })
    .from(schema.inventoryMovements)
    .innerJoin(schema.inventory, eq(schema.inventory.id, schema.inventoryMovements.inventoryId))
    .innerJoin(schema.products, eq(schema.products.id, schema.inventory.productId))
    .leftJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventory.variantId))
    // Reklamationer (internal_use MED orderId) visas på ordern, inte här.
    .where(
      and(
        eq(schema.inventoryMovements.reason, "internal_use"),
        isNull(schema.inventoryMovements.orderId),
      ),
    )
    .orderBy(desc(schema.inventoryMovements.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    productName: row.productName,
    variantName: row.variantName,
    quantity: -row.changeAmount,
    note: row.note,
    createdAt: row.createdAt,
  }));
}

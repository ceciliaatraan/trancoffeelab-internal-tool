import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expandLineToInventoryTargets } from "@/lib/inventory/bundles";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Tar varor ur lagret utan försäljning - eget uttag (eget bruk,
 * marknadsföring, event) och reklamationer (ersättningsvara skickad till en
 * kund). Minskar "I lager" (quantity) och sparar en lagerrörelse med orsak
 * internal_use per berörd lagerrad. Ett kit dras från sina komponenter
 * (samma expansion som en order). `orderId` sätts för reklamationer - så
 * skiljs de från eget uttag (orderId null). Returnerar produktnamnet.
 */
export async function takeFromStock(
  tx: Tx,
  input: {
    inventoryId: string;
    quantity: number;
    note: string;
    adminId: string;
    orderId?: string;
  },
): Promise<string> {
  const [row] = await tx
    .select({
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      productName: schema.products.nameSv,
    })
    .from(schema.inventory)
    .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
    .where(eq(schema.inventory.id, input.inventoryId));
  if (!row) throw new Error("Lagerraden finns inte.");

  const targets = await expandLineToInventoryTargets(tx, row.productId, row.variantId, input.quantity);
  for (const target of targets) {
    const condition = target.variantId
      ? and(
          eq(schema.inventory.productId, target.productId),
          eq(schema.inventory.variantId, target.variantId),
        )
      : and(eq(schema.inventory.productId, target.productId), isNull(schema.inventory.variantId));

    const [targetRow] = await tx
      .select({ id: schema.inventory.id })
      .from(schema.inventory)
      .where(condition)
      .for("update");
    if (!targetRow) continue;

    await tx
      .update(schema.inventory)
      .set({
        quantity: sql`${schema.inventory.quantity} - ${target.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.inventory.id, targetRow.id));

    await tx.insert(schema.inventoryMovements).values({
      inventoryId: targetRow.id,
      changeAmount: -target.quantity,
      reason: "internal_use",
      orderId: input.orderId ?? null,
      note:
        target.productId === row.productId
          ? input.note
          : `${input.note} (komponent i "${row.productName}")`,
      causedByAdminId: input.adminId,
    });
  }
  return row.productName;
}

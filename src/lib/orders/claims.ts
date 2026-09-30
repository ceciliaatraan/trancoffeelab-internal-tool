import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type ClaimItem = { name: string; quantity: number };

export type OrderClaim = {
  createdAt: Date;
  note: string | null;
  items: ClaimItem[];
};

/**
 * En orders reklamationer (ersättningsvaror skickade utan kostnad) - lagras
 * som internal_use-lagerrörelser MED orderId (se takeFromStock). Ett
 * kit-uttag blir flera rader, en per komponent, alla med samma createdAt
 * (samma transaktion) - de grupperas här tillbaka till EN reklamation.
 */
export async function getClaimsForOrder(orderId: string): Promise<OrderClaim[]> {
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
    .leftJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventory.variantId))
    .where(
      and(
        eq(schema.inventoryMovements.reason, "internal_use"),
        eq(schema.inventoryMovements.orderId, orderId),
      ),
    )
    .orderBy(desc(schema.inventoryMovements.createdAt));

  const byTime = new Map<string, OrderClaim>();
  for (const row of rows) {
    const key = row.createdAt.toISOString();
    const claim = byTime.get(key) ?? {
      createdAt: row.createdAt,
      // Kit-komponenternas anteckningar har ett "(komponent i ...)"-tillägg -
      // visa grundanteckningen en gång.
      note: row.note?.replace(/ \(komponent i "[^"]*"\)$/, "") ?? null,
      items: [],
    };
    claim.items.push({
      name: row.variantName ? `${row.productName} - ${row.variantName}` : row.productName,
      quantity: -row.changeAmount,
    });
    byTime.set(key, claim);
  }
  return [...byTime.values()];
}

export type ClaimOption = { inventoryId: string; label: string; inOrder: boolean };

/**
 * Varor som kan skickas som ersättning: alla lagerrader utom en produkts
 * egen rad när den säljs som varianter. Orderns egna varor (inklusive
 * komponenterna i ett kit) listas först.
 */
export async function getClaimOptions(
  orderItemKeys: Set<string>,
): Promise<ClaimOption[]> {
  const rows = await db
    .select({
      inventoryId: schema.inventory.id,
      productId: schema.inventory.productId,
      variantId: schema.inventory.variantId,
      productName: schema.products.nameSv,
      variantName: schema.productVariants.nameSv,
    })
    .from(schema.inventory)
    .innerJoin(schema.products, eq(schema.products.id, schema.inventory.productId))
    .leftJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventory.variantId))
    .orderBy(asc(schema.products.nameSv));

  const productsWithVariants = new Set(
    rows.filter((row) => row.variantId !== null).map((row) => row.productId),
  );

  return rows
    .filter((row) => row.variantId !== null || !productsWithVariants.has(row.productId))
    .map((row) => ({
      inventoryId: row.inventoryId,
      label: row.variantName ? `${row.productName} - ${row.variantName}` : row.productName,
      inOrder: orderItemKeys.has(`${row.productId}|${row.variantId ?? ""}`),
    }))
    .sort((a, b) => Number(b.inOrder) - Number(a.inOrder));
}

/** Antal reklamationer per kund (kund-id -> antal), för kundlistan. */
export async function getClaimCountsByCustomer(): Promise<Map<string, number>> {
  const rows = await db
    .selectDistinct({
      customerId: schema.orders.customerId,
      orderId: schema.inventoryMovements.orderId,
      createdAt: schema.inventoryMovements.createdAt,
    })
    .from(schema.inventoryMovements)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.inventoryMovements.orderId))
    .where(
      and(
        eq(schema.inventoryMovements.reason, "internal_use"),
        isNotNull(schema.inventoryMovements.orderId),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.customerId) continue;
    counts.set(row.customerId, (counts.get(row.customerId) ?? 0) + 1);
  }
  return counts;
}

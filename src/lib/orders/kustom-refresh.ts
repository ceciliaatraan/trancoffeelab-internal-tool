import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getOrderManagementOrder } from "@/lib/kustom/client";
import { persistOrderFromKustom } from "@/lib/orders/persist-order";

type Order = typeof schema.orders.$inferSelect;

/**
 * Läser om EN order från Kustom och sparar status/debiterat/återbetalat
 * belopp + rådata (via persistOrderFromKustom). Behövs eftersom Kustom
 * INTE pushar till oss när något görs direkt i Kustoms portal - t.ex. en
 * order som debiteras där syntes annars aldrig som "Debiterad" hos oss.
 * Returnerar den uppdaterade raden, eller den gamla om Kustom inte gick
 * att nå (felet loggas, sidan/synken fortsätter på den sparade kopian).
 */
export async function refreshOrderFromKustom(order: Order): Promise<Order> {
  try {
    const fresh = await getOrderManagementOrder(order.kustomOrderId);
    await persistOrderFromKustom(fresh);
    const [updated] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    return updated ?? order;
  } catch (err) {
    console.error("Kunde inte läsa om order från Kustom", order.orderNumber, err);
    return order;
  }
}

export async function forEachConcurrently<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/**
 * Läser om alla riktiga ordrar som inte är färdigdebiterade (Godkänd/
 * Delvis debiterad) från Kustom, oavsett ålder och fraktstatus - så en
 * debitering eller annullering gjord i Kustoms portal syns hos oss.
 */
export async function refreshUnsettledOrdersFromKustom(): Promise<number> {
  const unsettled = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        inArray(schema.orders.status, ["AUTHORIZED", "PART_CAPTURED"]),
        eq(schema.orders.isTest, false),
      ),
    );

  await forEachConcurrently(unsettled, 4, async (order) => {
    await refreshOrderFromKustom(order);
  });
  return unsettled.length;
}

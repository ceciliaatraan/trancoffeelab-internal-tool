import "server-only";
import { after } from "next/server";
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

const UNSETTLED_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
let lastUnsettledRefresh = 0;

/**
 * refreshUnsettledOrdersFromKustom, högst varannan minut per serverinstans.
 * Orderlistan väntar in den innan den läser ordrarna, så en debitering gjord
 * i Kustoms portal syns direkt när listan öppnas; startsidan kör den i
 * bakgrunden. Fel loggas bara - listan visas alltid.
 */
export async function refreshUnsettledOrdersFromKustomIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastUnsettledRefresh < UNSETTLED_REFRESH_INTERVAL_MS) return;
  lastUnsettledRefresh = now;
  try {
    await refreshUnsettledOrdersFromKustom();
  } catch (err) {
    console.error("Kunde inte läsa om ej debiterade ordrar från Kustom", err);
  }
}

const PER_ORDER_REFRESH_INTERVAL_MS = 60 * 1000;
const lastRefreshByOrderId = new Map<string, number>();

/**
 * Läser om just de här ordrarna från Kustom (t.ex. de ej debiterade på den
 * sida av orderlistan som visas), högst en gång per minut och order per
 * serverinstans och högst `budgetMs` innan sidan visas - det som inte hunnit
 * klart körs färdigt i bakgrunden (after). Returnerar true om någon order
 * faktiskt lästes om i tid, så anroparen vet att den ska läsa om raderna.
 */
export async function refreshOrdersFromKustomWithin(
  orders: { id: string; kustomOrderId: string; orderNumber: number }[],
  budgetMs: number,
): Promise<boolean> {
  const now = Date.now();
  const due = orders.filter(
    (order) => now - (lastRefreshByOrderId.get(order.id) ?? 0) >= PER_ORDER_REFRESH_INTERVAL_MS,
  );
  if (due.length === 0) return false;
  for (const order of due) lastRefreshByOrderId.set(order.id, now);

  const work = forEachConcurrently(due, 6, async (order) => {
    try {
      const fresh = await getOrderManagementOrder(order.kustomOrderId);
      await persistOrderFromKustom(fresh);
    } catch (err) {
      console.error("Kunde inte läsa om order från Kustom", order.orderNumber, err);
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const finishedInTime = await Promise.race([
    work.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), budgetMs);
    }),
  ]);
  clearTimeout(timer);
  if (!finishedInTime) after(() => work);
  return true;
}

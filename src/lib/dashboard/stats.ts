import "server-only";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayKeyLabel, previousDayKey, stockholmDayKey, type DailySales } from "./day-buckets";

export type { DailySales, DashboardSummary } from "./day-buckets";
export { summarizeDailySales } from "./day-buckets";

/**
 * Senaste `days` dagarna (inklusive idag), i svensk lokal tid, med 0 för
 * dagar utan ordrar. Exkluderar testordrar (is_test) och
 * avbrutna/utgångna ordrar — de ska inte synas i "hur går det"-vyer.
 */
export async function getDailySales(days: number): Promise<DailySales[]> {
  const since = new Date(Date.now() - (days + 2) * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      createdAt: schema.orders.createdAt,
      orderAmountOre: schema.orders.orderAmountOre,
    })
    .from(schema.orders)
    .where(
      and(
        gte(schema.orders.createdAt, since),
        eq(schema.orders.isTest, false),
        ne(schema.orders.status, "CANCELLED"),
        ne(schema.orders.status, "EXPIRED"),
      ),
    );

  const byDay = new Map<string, { totalOre: number; orderCount: number }>();
  for (const row of rows) {
    const key = stockholmDayKey(row.createdAt);
    const bucket = byDay.get(key) ?? { totalOre: 0, orderCount: 0 };
    bucket.totalOre += row.orderAmountOre;
    bucket.orderCount += 1;
    byDay.set(key, bucket);
  }

  const keys: string[] = [];
  let key = stockholmDayKey(new Date());
  for (let i = 0; i < days; i++) {
    keys.unshift(key);
    key = previousDayKey(key);
  }

  return keys.map((dayKey) => {
    const bucket = byDay.get(dayKey);
    return {
      dayKey,
      label: dayKeyLabel(dayKey),
      totalOre: bucket?.totalOre ?? 0,
      orderCount: bucket?.orderCount ?? 0,
    };
  });
}

export type RecentOrder = {
  id: string;
  orderNumber: number;
  customerEmail: string;
  orderAmountOre: number;
  status: string;
  fulfillmentStatus: string;
  containsPreorder: boolean;
  createdAt: Date;
};

/** Senaste riktiga (icke-test) ordrarna, nyast först — för "hur går det"-översikten. */
export async function getRecentOrders(limit: number): Promise<RecentOrder[]> {
  return db
    .select({
      id: schema.orders.id,
      orderNumber: schema.orders.orderNumber,
      customerEmail: schema.orders.customerEmail,
      orderAmountOre: schema.orders.orderAmountOre,
      status: schema.orders.status,
      fulfillmentStatus: schema.orders.fulfillmentStatus,
      containsPreorder: schema.orders.containsPreorder,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.isTest, false))
    .orderBy(desc(schema.orders.createdAt))
    .limit(limit);
}

export type TopProduct = {
  productId: string | null;
  name: string;
  quantity: number;
  revenueOre: number;
};

/**
 * Mest sålda fysiska produkter senaste `days` dagarna, efter antal sålda
 * enheter. Grupperat på radens sparade namn (inte en live-join mot
 * products), så borttagna/ändrade produkter fortfarande syns korrekt
 * för historiska ordrar.
 */
export async function getTopProducts(days: number, limit: number): Promise<TopProduct[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      productId: schema.orderLines.productId,
      name: schema.orderLines.name,
      quantity: sql<number>`coalesce(sum(${schema.orderLines.quantity}), 0)`,
      revenueOre: sql<number>`coalesce(sum(${schema.orderLines.totalAmountOre}), 0)`,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(
      and(
        eq(schema.orderLines.type, "physical"),
        gte(schema.orders.createdAt, since),
        eq(schema.orders.isTest, false),
        ne(schema.orders.status, "CANCELLED"),
        ne(schema.orders.status, "EXPIRED"),
      ),
    )
    .groupBy(schema.orderLines.productId, schema.orderLines.name)
    .orderBy(desc(sql`sum(${schema.orderLines.quantity})`))
    .limit(limit);

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    quantity: Number(row.quantity),
    revenueOre: Number(row.revenueOre),
  }));
}

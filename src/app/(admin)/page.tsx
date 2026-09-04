import Link from "next/link";
import { and, asc, desc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime, formatOre } from "@/lib/format";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Måndag som veckostart, svensk konvention. */
function startOfWeek(): Date {
  const today = startOfToday();
  const day = today.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  today.setDate(today.getDate() - diffToMonday);
  return today;
}

async function sumOrderAmount(since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.orders.orderAmountOre}), 0)` })
    .from(schema.orders)
    .where(
      and(
        gte(schema.orders.createdAt, since),
        ne(schema.orders.status, "CANCELLED"),
        ne(schema.orders.status, "EXPIRED"),
      ),
    );
  return Number(row?.total ?? 0);
}

export default async function DashboardPage() {
  const [todaySales, weekSales, unprocessedOrders, lowStock, webhookErrors] = await Promise.all([
    sumOrderAmount(startOfToday()),
    sumOrderAmount(startOfWeek()),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orders)
      .where(eq(schema.orders.fulfillmentStatus, "unfulfilled")),
    db
      .select({
        productName: schema.products.nameSv,
        variantName: schema.productVariants.nameSv,
        quantity: schema.inventory.quantity,
        reservedQuantity: schema.inventory.reservedQuantity,
        alarmLevel: schema.inventory.alarmLevel,
      })
      .from(schema.inventory)
      .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
      .leftJoin(schema.productVariants, eq(schema.inventory.variantId, schema.productVariants.id))
      .where(lte(schema.inventory.quantity, schema.inventory.alarmLevel))
      .orderBy(asc(schema.inventory.quantity)),
    db
      .select()
      .from(schema.webhookEvents)
      .where(and(eq(schema.webhookEvents.processed, false), isNotNull(schema.webhookEvents.errorMessage)))
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(5),
  ]);

  const unprocessedCount = Number(unprocessedOrders[0]?.count ?? 0);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Dashboard</h1>

      <section className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Försäljning idag</p>
          <p className="tran-tabular text-2xl">{formatOre(todaySales)}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Försäljning denna vecka</p>
          <p className="tran-tabular text-2xl">{formatOre(weekSales)}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Obehandlade ordrar</p>
          <p className="tran-tabular text-2xl">{unprocessedCount}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Under larmnivå</p>
          <p className="tran-tabular text-2xl">{lowStock.length}</p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Produkter under larmnivå</h2>
        {lowStock.length === 0 ? (
          <p className="text-sm text-tran-muted">Inga produkter under larmnivå.</p>
        ) : (
          <ul className="text-sm">
            {lowStock.map((row, index) => (
              <li key={index} className="border-b border-tran-hairline py-2">
                {row.productName}
                {row.variantName ? ` — ${row.variantName}` : ""}: {row.quantity} i lager
                (larmnivå {row.alarmLevel})
              </li>
            ))}
          </ul>
        )}
        <Link href="/inventory" className="text-sm text-tran-muted hover:text-tran-red">
          Gå till lager →
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Senaste webhook-fel</h2>
        {webhookErrors.length === 0 ? (
          <p className="text-sm text-tran-muted">Inga webhook-fel.</p>
        ) : (
          <ul className="text-sm">
            {webhookErrors.map((event) => (
              <li key={event.id} className="border-b border-tran-hairline py-2">
                <span className="text-tran-red">{event.errorMessage}</span> —{" "}
                {formatDateTime(event.receivedAt)}
              </li>
            ))}
          </ul>
        )}
        <Link href="/logs" className="text-sm text-tran-muted hover:text-tran-red">
          Gå till loggar →
        </Link>
      </section>
    </div>
  );
}

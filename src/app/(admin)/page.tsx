import Link from "next/link";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime, formatOre } from "@/lib/format";
import { getInventoryOverview } from "@/lib/inventory/overview";
import { getDailySales, getRecentOrders, getTopProducts, summarizeDailySales } from "@/lib/dashboard/stats";
import { SalesBarChart } from "@/components/sales-bar-chart";
import { TopProductsList } from "@/components/top-products-list";
import { OrderStatusChip } from "@/components/order-status-chip";
import { PreorderChip } from "@/components/preorder-chip";

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: "Ej skickad",
  shipped: "Skickad",
  cancelled: "Avbruten",
};

export default async function DashboardPage() {
  const [daily, recentOrders, topProducts, unprocessedOrders, inventoryOverview, webhookErrors] =
    await Promise.all([
      getDailySales(30),
      getRecentOrders(8),
      getTopProducts(30, 5),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.orders)
        .where(and(eq(schema.orders.fulfillmentStatus, "unfulfilled"), eq(schema.orders.isTest, false))),
      getInventoryOverview(),
      db
        .select()
        .from(schema.webhookEvents)
        .where(and(eq(schema.webhookEvents.processed, false), isNotNull(schema.webhookEvents.errorMessage)))
        .orderBy(desc(schema.webhookEvents.receivedAt))
        .limit(5),
    ]);

  const summary = summarizeDailySales(daily);
  const unprocessedCount = Number(unprocessedOrders[0]?.count ?? 0);
  const lowStock = inventoryOverview
    .filter((row) => row.available <= row.alarmLevel)
    .sort((a, b) => a.available - b.available);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Dashboard</h1>

      <section className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Försäljning idag</p>
          <p className="tran-tabular text-2xl">{formatOre(summary.todayOre)}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Denna vecka</p>
          <p className="tran-tabular text-2xl">{formatOre(summary.weekOre)}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Denna månad</p>
          <p className="tran-tabular text-2xl">{formatOre(summary.monthOre)}</p>
        </div>
        <div className="border border-tran-hairline p-6">
          <p className="tran-label text-xs text-tran-muted">Snittorder (månad)</p>
          <p className="tran-tabular text-2xl">{formatOre(summary.monthAvgOrderOre)}</p>
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

      <section className="flex flex-col gap-4 border border-tran-hairline p-6">
        <h2 className="tran-label text-xs text-tran-muted">Försäljning, senaste 30 dagarna</h2>
        <SalesBarChart data={daily} />
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="tran-label text-xs text-tran-muted">Senaste ordrar</h2>
            <Link href="/orders" className="text-sm text-tran-muted hover:text-tran-red">
              Alla ordrar →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-tran-muted">Inga ordrar än.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Kund</th>
                  <th className="py-2 pr-4 font-medium">Belopp</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Frakt</th>
                  <th className="py-2 pr-4 font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-tran-hairline">
                    <td className="py-3 pr-4">
                      <Link href={`/orders/${order.id}`} className="tran-tabular hover:text-tran-red">
                        #{order.orderNumber}
                      </Link>
                    </td>
                    <td className="max-w-[160px] truncate py-3 pr-4 text-tran-muted">
                      {order.customerEmail}
                    </td>
                    <td className="tran-tabular py-3 pr-4">{formatOre(order.orderAmountOre)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusChip status={order.status} />
                        {order.containsPreorder && <PreorderChip />}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-tran-muted">
                      {FULFILLMENT_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus}
                    </td>
                    <td className="tran-tabular py-3 pr-4 text-tran-muted">
                      {formatDateTime(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="tran-label text-xs text-tran-muted">Mest sålda, senaste 30 dagarna</h2>
          <TopProductsList products={topProducts} />
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Produkter under larmnivå</h2>
        {lowStock.length === 0 ? (
          <p className="text-sm text-tran-muted">Inga produkter under larmnivå.</p>
        ) : (
          <ul className="text-sm">
            {lowStock.map((row) => (
              <li key={row.inventoryId} className="border-b border-tran-hairline py-2">
                {row.productName}
                {row.variantName ? ` — ${row.variantName}` : ""}: {row.available} i lager
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

import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatOre, formatDateTime } from "@/lib/format";
import { OrderStatusChip } from "@/components/order-status-chip";
import { PreorderChip } from "@/components/preorder-chip";
import { TestOrderChip } from "@/components/test-order-chip";
import { SubmitButton } from "@/components/submit-button";
import { FraktStatusBadge } from "@/components/frakt-status-badge";
import { TableRowLink } from "@/components/table-row-link";
import { getFraktStatusByOrderId } from "@/lib/orders/frakt-status-for-orders";

type ShippingAddress = { given_name?: string; family_name?: string };

/** Namn från leveransadressen om det finns, annars e-post. */
function customerDisplayName(order: { customerEmail: string; shippingAddress: unknown }): string {
  const address = order.shippingAddress as ShippingAddress | null;
  const name = [address?.given_name, address?.family_name].filter(Boolean).join(" ").trim();
  return name || order.customerEmail;
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : "";
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const error = typeof params.error === "string" ? params.error : null;
  const deleted = "deleted" in params;

  const conditions = [];
  if (statusFilter) {
    conditions.push(
      eq(
        schema.orders.fulfillmentStatus,
        statusFilter as "unfulfilled" | "label_created" | "shipped" | "cancelled",
      ),
    );
  }
  if (query) {
    const orderNumber = Number(query);
    conditions.push(
      or(
        ilike(schema.orders.customerEmail, `%${query}%`),
        Number.isInteger(orderNumber) ? eq(schema.orders.orderNumber, orderNumber) : sql`false`,
      ),
    );
  }

  const orders = await db
    .select()
    .from(schema.orders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.orders.createdAt))
    .limit(100);

  // Namn på det som beställts, till hover-tooltip på "Belopp".
  const orderIds = orders.map((order) => order.id);
  const itemsByOrderId = new Map<string, string[]>();
  if (orderIds.length > 0) {
    const lines = await db
      .select({
        orderId: schema.orderLines.orderId,
        name: schema.orderLines.name,
        quantity: schema.orderLines.quantity,
        type: schema.orderLines.type,
      })
      .from(schema.orderLines)
      .where(inArray(schema.orderLines.orderId, orderIds))
      .orderBy(asc(schema.orderLines.sortOrder));

    for (const line of lines) {
      if (line.type !== "physical") continue;
      const existing = itemsByOrderId.get(line.orderId) ?? [];
      existing.push(`${line.quantity}x ${line.name}`);
      itemsByOrderId.set(line.orderId, existing);
    }
  }

  // Live PostNord-status i "Frakt"-kolumnen - läsning bara (se
  // lib/postnord/client.ts). Ett fel för EN order (fel nummer, PostNord
  // nere) visar bara den ordens rad med den vanliga texten, hindrar
  // aldrig resten av listan från att laddas. Delad med Dashboard-
  // startsidans "Senaste ordrar" - se frakt-status-for-orders.ts.
  const fraktStatusByOrderId = await getFraktStatusByOrderId(orders);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Ordrar</h1>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {deleted ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          Ordern togs bort.
        </p>
      ) : null}

      <form className="flex flex-wrap items-end gap-4">
        <div>
          <label className="tran-label mb-1.5 block text-xs text-tran-muted" htmlFor="q">
            Sök (ordernummer/e-post)
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            className="w-64 border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none"
          />
        </div>
        <div>
          <label className="tran-label mb-1.5 block text-xs text-tran-muted" htmlFor="status">
            Fraktstatus
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none"
          >
            <option value="">Alla</option>
            <option value="unfulfilled">Ej skickad</option>
            <option value="label_created">Fraktsedel skapad</option>
            <option value="shipped">Skickad</option>
            <option value="cancelled">Avbruten</option>
          </select>
        </div>
        <SubmitButton className="border border-tran-black px-4 py-2 text-sm font-medium transition-colors hover:border-tran-red hover:text-tran-red">
          Filtrera
        </SubmitButton>
        <a
          href="/api/orders/export-postnord"
          className="tran-label border border-tran-black px-4 py-2.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
        >
          Exportera till PostNord (CSV)
        </a>
      </form>

      {orders.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga ordrar än.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-3 pr-4 font-medium">Order</th>
              <th className="py-3 pr-4 font-medium">Kund</th>
              <th className="py-3 pr-4 font-medium">Belopp</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Frakt</th>
              <th className="py-3 pr-4 font-medium">Datum</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const items = itemsByOrderId.get(order.id);
              const fraktStatus = fraktStatusByOrderId.get(order.id) ?? {
                kind: "ej_skickad" as const,
                label: order.fulfillmentStatus,
              };

              return (
                <TableRowLink
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="border-b border-tran-hairline hover:bg-tran-hairline/20"
                >
                  <td className="py-4 pr-4">
                    <Link
                      href={`/orders/${order.id}`}
                      className="tran-tabular hover:text-tran-red"
                    >
                      #{order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-4 pr-4 text-tran-muted">{customerDisplayName(order)}</td>
                  <td
                    className="tran-tabular py-4 pr-4"
                    title={items && items.length > 0 ? items.join("\n") : undefined}
                  >
                    {formatOre(order.orderAmountOre)}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <OrderStatusChip status={order.status} />
                      {order.containsPreorder && <PreorderChip />}
                      {order.isTest && <TestOrderChip />}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <FraktStatusBadge kind={fraktStatus.kind} label={fraktStatus.label} />
                  </td>
                  <td className="tran-tabular py-4 pr-4 text-tran-muted">
                    {formatDateTime(order.createdAt)}
                  </td>
                </TableRowLink>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

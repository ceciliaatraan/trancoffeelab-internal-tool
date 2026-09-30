import Link from "next/link";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatOre, formatDateTime } from "@/lib/format";
import { OrderStatusChip } from "@/components/order-status-chip";
import { PreorderChip } from "@/components/preorder-chip";
import { TestOrderChip } from "@/components/test-order-chip";
import { SubmitButton } from "@/components/submit-button";
import { FraktStatusBadge } from "@/components/frakt-status-badge";
import { TableRowLink } from "@/components/table-row-link";
import { getFraktStatusByOrderId } from "@/lib/orders/frakt-status-for-orders";
import { customerDisplayName } from "@/lib/orders/customer-display-name";
import { scheduleBackgroundSync } from "@/lib/orders/postnord-auto-sync";
import { refreshOrdersFromKustomWithin } from "@/lib/orders/kustom-refresh";
import {
  DEFAULT_PER_PAGE,
  PER_PAGE_OPTIONS,
  ordersHref,
  pageCount,
  parsePageParams,
  visiblePages,
} from "@/lib/orders/pagination";
import { containsPattern, searchTerms } from "@/lib/orders/order-search";
import { paymentMethodInfo } from "@/lib/kustom/payment-methods";

// Ger bakgrundssynken mot Kustom/PostNord (scheduleBackgroundSync) tid att gå igenom
// alla öppna ordrar vid dygnets fulla genomgång.
export const maxDuration = 60;

const pageLinkClass =
  "tran-tabular border border-tran-hairline px-2.5 py-1 transition-colors hover:border-tran-black";

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  // searchParams först - det gör sidan dynamisk, så Kustom-anropet nedan
  // aldrig körs under bygget, bara vid riktiga sidvisningar.
  const params = await searchParams;
  scheduleBackgroundSync();
  const statusFilter = typeof params.status === "string" ? params.status : "";
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const error = typeof params.error === "string" ? params.error : null;
  const deleted = "deleted" in params;
  const { page: requestedPage, perPage } = parsePageParams(params);
  let page = requestedPage;

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
    // Varje ord ska finnas någonstans i orderns sökbara text: namn (leverans
    // och faktura), företag, adress, postnummer (även utan mellanslag), ort,
    // e-post och fraktsedelns spårningsnummer. Ordernummer och skickningars
    // spårningsnummer matchas på hela söksträngen.
    const shipping = sql`${schema.orders.shippingAddress}`;
    const billing = sql`${schema.orders.billingAddress}`;
    const searchable = sql`concat_ws(' ',
      ${schema.orders.customerEmail},
      ${shipping}->>'given_name', ${shipping}->>'family_name', ${shipping}->>'organization_name',
      ${shipping}->>'street_address', ${shipping}->>'street_address2',
      ${shipping}->>'postal_code', replace(${shipping}->>'postal_code', ' ', ''), ${shipping}->>'city',
      ${billing}->>'given_name', ${billing}->>'family_name', ${billing}->>'organization_name',
      ${schema.orders.labelTrackingNumber})`;
    const orderNumber = Number(query.replace(/^#/, ""));
    conditions.push(
      or(
        Number.isInteger(orderNumber) ? eq(schema.orders.orderNumber, orderNumber) : sql`false`,
        and(...searchTerms(query).map((term) => sql`${searchable} ilike ${containsPattern(term)}`)),
        sql`exists (select 1 from ${schema.shipments} where ${schema.shipments.orderId} = ${schema.orders.id} and ${schema.shipments.trackingNumber} ilike ${containsPattern(query)})`,
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Bara de kolumner listan visar - INTE hela raw_kustom_order (flera kB per
  // order); betalsättet plockas ut direkt i databasen.
  const selectPage = (pageNumber: number) =>
    db
      .select({
        id: schema.orders.id,
        orderNumber: schema.orders.orderNumber,
        kustomOrderId: schema.orders.kustomOrderId,
        customerEmail: schema.orders.customerEmail,
        shippingAddress: schema.orders.shippingAddress,
        status: schema.orders.status,
        fulfillmentStatus: schema.orders.fulfillmentStatus,
        orderAmountOre: schema.orders.orderAmountOre,
        containsPreorder: schema.orders.containsPreorder,
        isTest: schema.orders.isTest,
        labelTrackingNumber: schema.orders.labelTrackingNumber,
        createdAt: schema.orders.createdAt,
        paymentMethod: sql<unknown>`${schema.orders.rawKustomOrder}->'initial_payment_method'`,
      })
      .from(schema.orders)
      .where(where)
      .orderBy(desc(schema.orders.createdAt), desc(schema.orders.orderNumber))
      .limit(perPage)
      .offset((pageNumber - 1) * perPage);

  const [firstPage, countRows] = await Promise.all([
    selectPage(page),
    db.select({ count: sql<number>`count(*)` }).from(schema.orders).where(where),
  ]);
  let orders = firstPage;
  const total = Number(countRows[0]?.count ?? 0);
  const totalPages = pageCount(total, perPage);
  // En sida bortom slutet (t.ex. efter att ordrar tagits bort) visar sista sidan.
  if (page > totalPages) {
    page = totalPages;
    orders = await selectPage(page);
  }

  // Betalstatus från Kustom för de ej debiterade ordrarna på DEN HÄR sidan
  // (t.ex. debiterade i Kustoms portal) - högst 2,5 s, resten i bakgrunden.
  // Övriga ordrar sköts av bakgrundssynken (scheduleBackgroundSync).
  const unsettled = orders.filter(
    (order) => !order.isTest && (order.status === "AUTHORIZED" || order.status === "PART_CAPTURED"),
  );
  if (unsettled.length > 0 && (await refreshOrdersFromKustomWithin(unsettled, 2500))) {
    orders = await selectPage(page);
  }

  const orderIds = orders.map((order) => order.id);
  const [lines, shipmentRows, fraktStatusByOrderId] = await Promise.all([
    orderIds.length > 0
      ? db
          .select({
            orderId: schema.orderLines.orderId,
            name: schema.orderLines.name,
            quantity: schema.orderLines.quantity,
            type: schema.orderLines.type,
          })
          .from(schema.orderLines)
          .where(inArray(schema.orderLines.orderId, orderIds))
          .orderBy(asc(schema.orderLines.sortOrder))
      : [],
    orderIds.length > 0
      ? db
          .select({
            orderId: schema.shipments.orderId,
            trackingNumber: schema.shipments.trackingNumber,
          })
          .from(schema.shipments)
          .where(inArray(schema.shipments.orderId, orderIds))
          .orderBy(asc(schema.shipments.shippedAt))
      : [],
    // Live PostNord-status i "Frakt"-kolumnen - läsning bara (se
    // lib/postnord/client.ts). Ett fel för EN order visar bara den ordens
    // rad med den vanliga texten. Delad med startsidan - se
    // frakt-status-for-orders.ts.
    getFraktStatusByOrderId(orders),
  ]);

  // Namn på det som beställts, till hover-tooltip på "Belopp".
  const itemsByOrderId = new Map<string, string[]>();
  for (const line of lines) {
    if (line.type !== "physical") continue;
    const existing = itemsByOrderId.get(line.orderId) ?? [];
    existing.push(`${line.quantity}x ${line.name}`);
    itemsByOrderId.set(line.orderId, existing);
  }

  // Spårningsnummer under fraktstatusen: från skickningen (inmatat för hand
  // eller hittat av PostNord-synken), annars fraktsedelns.
  const trackingNumberByOrderId = new Map<string, string>();
  for (const row of shipmentRows) {
    if (row.trackingNumber === "(ingen spårning)") continue;
    trackingNumberByOrderId.set(row.orderId, row.trackingNumber);
  }

  const current = { q: query, status: statusFilter, perPage, page };
  const firstShown = total === 0 ? 0 : (page - 1) * perPage + 1;
  const lastShown = Math.min(page * perPage, total);

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
        {perPage !== DEFAULT_PER_PAGE ? <input type="hidden" name="perPage" value={perPage} /> : null}
        <div>
          <label className="tran-label mb-1.5 block text-xs text-tran-muted" htmlFor="q">
            Sök (ordernr, namn, adress, e-post, spårningsnr)
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
          {total > 0 ? "Inga ordrar på den här sidan." : query || statusFilter ? "Inga ordrar matchar." : "Inga ordrar än."}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-3 pr-4 font-medium">Order</th>
              <th className="py-3 pr-4 font-medium">Kund</th>
              <th className="py-3 pr-4 font-medium">Belopp</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Betalsätt</th>
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
              const postnordNumber =
                trackingNumberByOrderId.get(order.id) ?? order.labelTrackingNumber;

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
                  <td className="py-4 pr-4 text-xs text-tran-muted">
                    {paymentMethodInfo({ initial_payment_method: order.paymentMethod })?.label ?? "-"}
                  </td>
                  <td className="py-4 pr-4">
                    <FraktStatusBadge kind={fraktStatus.kind} label={fraktStatus.label} />
                    {postnordNumber ? (
                      <p className="tran-tabular mt-1 text-[11px] text-tran-muted">
                        {postnordNumber}
                      </p>
                    ) : null}
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

      <nav
        aria-label="Sidnavigering"
        className="flex flex-wrap items-center justify-between gap-4 text-sm"
      >
        <p className="tran-tabular text-tran-muted">
          {total === 0 ? "0 ordrar" : `Visar ${firstShown}-${lastShown} av ${total}`}
        </p>

        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={ordersHref(current, { page: page - 1 })} className={pageLinkClass}>
                ← Föregående
              </Link>
            ) : null}
            {visiblePages(page, totalPages).map((p, index) =>
              p === null ? (
                <span key={`gap-${index}`} className="px-2 text-tran-muted">
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={ordersHref(current, { page: p })}
                  aria-current={p === page ? "page" : undefined}
                  className={`${pageLinkClass} ${p === page ? "border-tran-black bg-tran-black text-tran-white" : ""}`}
                >
                  {p}
                </Link>
              ),
            )}
            {page < totalPages ? (
              <Link href={ordersHref(current, { page: page + 1 })} className={pageLinkClass}>
                Nästa →
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-tran-muted">
          <span className="tran-label text-xs">Per sida</span>
          {PER_PAGE_OPTIONS.map((option) => (
            <Link
              key={option}
              href={ordersHref(current, { perPage: option, page: 1 })}
              aria-current={option === perPage ? "true" : undefined}
              className={`tran-tabular px-1.5 ${option === perPage ? "font-medium text-tran-black underline underline-offset-4" : "hover:text-tran-red"}`}
            >
              {option}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

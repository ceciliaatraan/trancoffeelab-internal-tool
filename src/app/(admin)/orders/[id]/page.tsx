import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime, formatOre } from "@/lib/format";
import { OrderStatusChip } from "@/components/order-status-chip";
import {
  cancelOrderAction,
  captureOrderAction,
  markShippedAction,
  refundFullAction,
  refundPartialAction,
} from "../actions";

type Address = {
  given_name?: string;
  family_name?: string;
  email?: string;
  phone?: string;
  street_address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
};

function AddressBlock({ address, title }: { address: Address | null; title: string }) {
  if (!address) {
    return (
      <div>
        <h3 className="tran-label mb-2 text-xs text-tran-muted">{title}</h3>
        <p className="text-sm text-tran-muted">Saknas</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="tran-label mb-2 text-xs text-tran-muted">{title}</h3>
      <p className="text-sm">
        {address.given_name} {address.family_name}
        <br />
        {address.street_address}
        <br />
        {address.postal_code} {address.city}
        <br />
        {address.country?.toUpperCase()}
        {address.phone ? (
          <>
            <br />
            {address.phone}
          </>
        ) : null}
      </p>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  capture: "Debitering",
  refund: "Återbetalning",
  cancel: "Annullering",
};

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const saved = "saved" in search;

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order) notFound();

  const [lines, events, shipmentRows] = await Promise.all([
    db
      .select()
      .from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, id))
      .orderBy(asc(schema.orderLines.sortOrder)),
    db
      .select()
      .from(schema.orderEvents)
      .where(eq(schema.orderEvents.orderId, id))
      .orderBy(desc(schema.orderEvents.createdAt)),
    db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id)),
  ]);

  const remainingToCapture = order.orderAmountOre - order.capturedAmountOre;
  const remainingToRefund = order.capturedAmountOre - order.refundedAmountOre;
  const canCancel = order.fulfillmentStatus !== "cancelled" && order.capturedAmountOre === 0;
  const canShip = order.fulfillmentStatus === "unfulfilled";

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex items-center gap-4">
        <Link href="/orders" className="text-sm text-tran-muted hover:text-tran-red">
          ← Ordrar
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-4xl">Order #{order.orderNumber}</h1>
          <OrderStatusChip status={order.status} />
        </div>
        <Link
          href={`/orders/${order.id}/pick-list`}
          target="_blank"
          className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
        >
          Skriv ut plocklista
        </Link>
      </div>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">Sparat.</p>
      ) : null}

      <section className="grid grid-cols-2 gap-6 border border-tran-hairline p-6 sm:grid-cols-4">
        <div>
          <p className="tran-label text-xs text-tran-muted">Belopp</p>
          <p className="tran-tabular text-lg">{formatOre(order.orderAmountOre)}</p>
        </div>
        <div>
          <p className="tran-label text-xs text-tran-muted">Debiterat</p>
          <p className="tran-tabular text-lg">{formatOre(order.capturedAmountOre)}</p>
        </div>
        <div>
          <p className="tran-label text-xs text-tran-muted">Återbetalat</p>
          <p className="tran-tabular text-lg">{formatOre(order.refundedAmountOre)}</p>
        </div>
        <div>
          <p className="tran-label text-xs text-tran-muted">Datum</p>
          <p className="text-sm">{formatDateTime(order.createdAt)}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AddressBlock address={order.billingAddress as Address | null} title="Fakturaadress" />
        <AddressBlock address={order.shippingAddress as Address | null} title="Leveransadress" />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Orderrader</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-2 pr-4 font-medium">Namn</th>
              <th className="py-2 pr-4 font-medium">SKU</th>
              <th className="py-2 pr-4 font-medium">Antal</th>
              <th className="py-2 pr-4 font-medium">À-pris</th>
              <th className="py-2 pr-4 font-medium">Summa</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-tran-hairline">
                <td className="py-3 pr-4">{line.name}</td>
                <td className="tran-tabular py-3 pr-4 text-tran-muted">{line.reference}</td>
                <td className="tran-tabular py-3 pr-4">{line.quantity}</td>
                <td className="tran-tabular py-3 pr-4 text-tran-muted">
                  {formatOre(line.unitPriceOre)}
                </td>
                <td className="tran-tabular py-3 pr-4">{formatOre(line.totalAmountOre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Betalning</h2>
        <div className="flex flex-wrap gap-3">
          {remainingToCapture > 0 ? (
            <form action={captureOrderAction.bind(null, order.id)} className="flex items-end gap-2">
              <div>
                <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                  Debitera (öre, valfritt — tomt = {remainingToCapture})
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  max={remainingToCapture}
                  placeholder={String(remainingToCapture)}
                  className="w-40 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
              >
                Debitera
              </button>
            </form>
          ) : null}

          {remainingToRefund > 0 ? (
            <>
              <form action={refundPartialAction.bind(null, order.id)} className="flex items-end gap-2">
                <div>
                  <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                    Delåterbetala (öre)
                  </label>
                  <input
                    name="amount"
                    type="number"
                    min={1}
                    max={remainingToRefund}
                    required
                    className="w-40 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
                >
                  Återbetala
                </button>
              </form>
              <form action={refundFullAction.bind(null, order.id)}>
                <button
                  type="submit"
                  className="tran-label self-end border border-tran-red px-3 py-1.5 text-xs text-tran-red transition-colors hover:bg-tran-red hover:text-tran-white"
                >
                  Full återbetalning ({formatOre(remainingToRefund)})
                </button>
              </form>
            </>
          ) : null}

          {canCancel ? (
            <form action={cancelOrderAction.bind(null, order.id)}>
              <button
                type="submit"
                className="tran-label border border-tran-red px-3 py-1.5 text-xs text-tran-red transition-colors hover:bg-tran-red hover:text-tran-white"
              >
                Annullera order
              </button>
            </form>
          ) : null}
        </div>

        {events.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-2 pr-4 font-medium">Händelse</th>
                <th className="py-2 pr-4 font-medium">Belopp</th>
                <th className="py-2 pr-4 font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-tran-hairline">
                  <td className="py-2 pr-4">{EVENT_LABELS[event.type] ?? event.type}</td>
                  <td className="tran-tabular py-2 pr-4">
                    {event.amountOre !== null ? formatOre(event.amountOre) : "—"}
                  </td>
                  <td className="tran-tabular py-2 pr-4 text-tran-muted">
                    {formatDateTime(event.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Frakt</h2>
        {shipmentRows.length > 0 ? (
          <ul className="text-sm">
            {shipmentRows.map((shipment) => (
              <li key={shipment.id}>
                {shipment.carrier} — {shipment.trackingNumber} ({formatDateTime(shipment.shippedAt)})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tran-muted">Inte skickad än.</p>
        )}

        {canShip ? (
          <form
            action={markShippedAction.bind(null, order.id)}
            className="flex flex-wrap items-end gap-3 border border-tran-hairline p-4"
          >
            <div>
              <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                Fraktbolag
              </label>
              <input
                name="carrier"
                required
                className="w-40 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
              />
            </div>
            <div>
              <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                Spårningsnummer
              </label>
              <input
                name="trackingNumber"
                required
                className="w-52 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
            >
              Markera som skickad
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

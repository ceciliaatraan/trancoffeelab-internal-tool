import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDateTime, formatOre } from "@/lib/format";
import { oreToKronorInput } from "@/lib/money-input";
import { OrderStatusChip } from "@/components/order-status-chip";
import { TestOrderChip } from "@/components/test-order-chip";
import { SubmitButton } from "@/components/submit-button";
import { FraktStatusBadge } from "@/components/frakt-status-badge";
import { resolveFraktStatus } from "@/lib/orders/fulfillment-status";
import {
  cancelOrderAction,
  captureOrderAction,
  deleteOrderAction,
  markLabelCreatedAction,
  markShippedAction,
  refundFullAction,
  refundPartialAction,
} from "../actions";
import {
  PostnordApiError,
  findPostnordShipmentsByReference,
  trackPostnordShipment,
  type PostnordShipmentTracking,
} from "@/lib/postnord/client";

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
  const postnordSearch =
    typeof search.postnordSearch === "string" ? search.postnordSearch.trim() : "";
  const prefillTrackingNumber =
    typeof search.trackingNumber === "string" ? search.trackingNumber : "";

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
    db
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.orderId, id))
      .orderBy(asc(schema.shipments.shippedAt)),
  ]);

  // Fraktstatus hämtas live från PostNords Track & Trace-API för
  // riktiga PostNord-spårningsnummer (inte "(ingen spårning)" för
  // handleveranser) - läsning bara, bokar/ändrar aldrig något. Ett fel
  // för EN skickning (fel spårningsnummer, PostNord nere) ska aldrig
  // hindra resten av sidan från att visas.
  const postnordTracking = new Map<
    string,
    { data: PostnordShipmentTracking | null; error: string | null }
  >();
  await Promise.all(
    shipmentRows
      .filter(
        (shipment) =>
          shipment.carrier.toLowerCase().includes("postnord") &&
          shipment.trackingNumber !== "(ingen spårning)",
      )
      .map(async (shipment) => {
        try {
          const data = await trackPostnordShipment(shipment.trackingNumber, "sv");
          postnordTracking.set(shipment.id, { data, error: null });
        } catch (err) {
          postnordTracking.set(shipment.id, {
            data: null,
            error:
              err instanceof PostnordApiError
                ? err.message
                : "Kunde inte hämta fraktstatus från PostNord just nu.",
          });
        }
      }),
  );

  const latestShipment = shipmentRows.at(-1) ?? null;
  const latestPostnordStatus = latestShipment
    ? (postnordTracking.get(latestShipment.id)?.data?.status ?? null)
    : null;
  const fraktStatus = resolveFraktStatus(
    order.fulfillmentStatus,
    latestShipment?.carrier ?? null,
    latestPostnordStatus,
  );

  const remainingToCapture = order.orderAmountOre - order.capturedAmountOre;
  const remainingToRefund = order.capturedAmountOre - order.refundedAmountOre;
  const canCancel = order.fulfillmentStatus !== "cancelled" && order.capturedAmountOre === 0;
  const canMarkLabelCreated = order.fulfillmentStatus === "unfulfilled";
  const canShip =
    order.fulfillmentStatus === "unfulfilled" || order.fulfillmentStatus === "label_created";
  // Sökresultatens "Använd"-länk hoppar till nästa relevanta steg: om
  // fraktsedeln inte redan är markerad som skapad är det naturliga
  // nästa steget att markera det, annars är ordern redo att skickas.
  const nextStepAnchor = canMarkLabelCreated ? "fraktsedel-skapad" : "markera-skickad";

  // Sök upp spårningsnummer hos PostNord via en egen referens (t.ex. det
  // som skrevs i PostNords portal när en fraktsedel skapades manuellt,
  // utan att gå via vår CSV-export) - för ordrar där vi inte redan har
  // fått spårningsnumret inmatat. Läsning bara, bokar/ändrar aldrig
  // något. Körs bara när det faktiskt går att markera som skickad.
  let postnordSearchResults: PostnordShipmentTracking[] | null = null;
  let postnordSearchError: string | null = null;
  if (canShip && postnordSearch) {
    try {
      postnordSearchResults = await findPostnordShipmentsByReference(postnordSearch, "sv");
    } catch (err) {
      postnordSearchError =
        err instanceof PostnordApiError
          ? err.message
          : "Kunde inte söka hos PostNord just nu.";
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex items-center gap-4">
        <Link href="/orders" className="text-sm text-tran-muted hover:text-tran-red">
          ← Ordrar
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-bold uppercase tracking-tight">Order #{order.orderNumber}</h1>
          <OrderStatusChip status={order.status} />
          {order.isTest && <TestOrderChip />}
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
                  Debitera (kr, valfritt - tomt = {formatOre(remainingToCapture)})
                </label>
                <input
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  max={oreToKronorInput(remainingToCapture)}
                  placeholder={oreToKronorInput(remainingToCapture)}
                  className="w-40 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                />
              </div>
              <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                Debitera
              </SubmitButton>
            </form>
          ) : null}

          {remainingToRefund > 0 ? (
            <>
              <form action={refundPartialAction.bind(null, order.id)} className="flex items-end gap-2">
                <div>
                  <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                    Delåterbetala (kr)
                  </label>
                  <input
                    name="amount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    max={oreToKronorInput(remainingToRefund)}
                    required
                    className="w-40 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                  />
                </div>
                <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                  Återbetala
                </SubmitButton>
              </form>
              <form action={refundFullAction.bind(null, order.id)}>
                <SubmitButton className="tran-label self-end border border-tran-red px-3 py-1.5 text-xs text-tran-red transition-colors hover:bg-tran-red hover:text-tran-white">
                  Full återbetalning ({formatOre(remainingToRefund)})
                </SubmitButton>
              </form>
            </>
          ) : null}

          {canCancel ? (
            <form action={cancelOrderAction.bind(null, order.id)}>
              <SubmitButton className="tran-label border border-tran-red px-3 py-1.5 text-xs text-tran-red transition-colors hover:bg-tran-red hover:text-tran-white">
                Annullera order
              </SubmitButton>
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
                    {event.amountOre !== null ? formatOre(event.amountOre) : "-"}
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
        <div className="flex items-center gap-3">
          <h2 className="tran-label text-xs text-tran-muted">Frakt</h2>
          <FraktStatusBadge kind={fraktStatus.kind} label={fraktStatus.label} />
        </div>
        {shipmentRows.length > 0 ? (
          <ul className="flex flex-col gap-3 text-sm">
            {shipmentRows.map((shipment) => {
              const tracking = postnordTracking.get(shipment.id);
              return (
                <li key={shipment.id}>
                  <p>
                    {shipment.carrier} - {shipment.trackingNumber} (
                    {formatDateTime(shipment.shippedAt)})
                  </p>
                  {tracking?.data ? (
                    <p className="mt-1 text-xs text-tran-muted">
                      PostNord: {tracking.data.statusText.header}
                      {tracking.data.deliveryDate
                        ? ` (${formatDateTime(new Date(tracking.data.deliveryDate))})`
                        : ""}
                    </p>
                  ) : tracking?.error ? (
                    <p className="mt-1 text-xs text-tran-muted">
                      PostNord-status kunde inte hämtas: {tracking.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : order.fulfillmentStatus === "label_created" ? (
          <p className="text-sm text-tran-muted">
            Fraktsedel skapad
            {order.labelTrackingNumber ? ` - ${order.labelTrackingNumber}` : ""}, paketet inte
            lämnat/hämtat än.
          </p>
        ) : (
          <p className="text-sm text-tran-muted">Inte skickad än.</p>
        )}

        {canShip ? (
          <div className="flex flex-col gap-3 border border-tran-hairline p-4">
            <p className="tran-label text-[11px] text-tran-muted">
              Hitta spårningsnummer hos PostNord
            </p>
            <p className="text-xs text-tran-muted">
              Om fraktsedeln skapades i PostNords portal utan att spårningsnumret matats in här
              - sök på referensen ni skrev in där (t.ex. ordernummer eller kundens namn).
            </p>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div>
                <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                  Referens
                </label>
                <input
                  name="postnordSearch"
                  defaultValue={postnordSearch || `TRAN #${order.orderNumber}`}
                  className="w-52 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
              >
                Sök hos PostNord
              </button>
            </form>

            {postnordSearchError ? (
              <p className="text-xs text-tran-muted">
                Sökningen kunde inte genomföras: {postnordSearchError}
              </p>
            ) : postnordSearchResults ? postnordSearchResults.length === 0 ? (
              <p className="text-xs text-tran-muted">
                Inga skickningar hittades hos PostNord för &quot;{postnordSearch}&quot;.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {postnordSearchResults.map((result) => (
                  <li key={result.shipmentId} className="flex items-center gap-2">
                    <span className="tran-tabular">{result.shipmentId}</span>
                    <span className="text-tran-muted">{result.statusText.header}</span>
                    <Link
                      href={`/orders/${order.id}?trackingNumber=${encodeURIComponent(result.shipmentId)}#${nextStepAnchor}`}
                      className="tran-label border border-tran-black px-2 py-1 text-[11px] transition-colors hover:border-tran-red hover:text-tran-red"
                    >
                      Använd
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {canMarkLabelCreated ? (
          <div
            id="fraktsedel-skapad"
            className="flex flex-wrap items-end gap-3 border border-tran-hairline p-4"
          >
            <form
              action={markLabelCreatedAction.bind(null, order.id)}
              className="flex flex-wrap items-end gap-3"
            >
              <div>
                <label className="tran-label mb-1 block text-[11px] text-tran-muted">
                  Spårningsnummer (valfritt, kan fyllas i senare)
                </label>
                <input
                  name="trackingNumber"
                  defaultValue={prefillTrackingNumber}
                  className="w-52 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                />
              </div>
              <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                Markera: fraktsedel skapad
              </SubmitButton>
            </form>
          </div>
        ) : null}

        {canShip ? (
          <div id="markera-skickad" className="flex flex-wrap gap-3">
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
                  defaultValue="PostNord"
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
                  defaultValue={prefillTrackingNumber || order.labelTrackingNumber || ""}
                  className="w-52 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                />
              </div>
              <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                Markera som skickad
              </SubmitButton>
            </form>

            <form
              action={markShippedAction.bind(null, order.id)}
              className="flex flex-col items-start justify-end gap-1 border border-tran-hairline p-4"
            >
              <input type="hidden" name="carrier" value="Levererad för hand" />
              <input type="hidden" name="trackingNumber" value="(ingen spårning)" />
              <p className="text-xs text-tran-muted">
                För ordrar som lämnas över personligen, utan fraktbolag.
              </p>
              <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
                Markera som levererad för hand
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </section>

      {order.isTest || order.fulfillmentStatus === "cancelled" ? (
        <section className="flex flex-col gap-3 border border-tran-red p-6">
          <h2 className="tran-label text-xs text-tran-red">
            {order.isTest ? "Testorder" : "Avbruten order"}
          </h2>
          <p className="text-sm text-tran-muted">
            {order.isTest
              ? "Den här ordern skapades medan Kustom stod på testmiljö och räknas inte som en riktig beställning."
              : "Den här ordern är avbruten (t.ex. en egen testbeställning på skarpa sajten) - ingenting har debiterats."}{" "}
            Tar bort ordern permanent och återställer det lagersaldo den påverkade.
          </p>
          <form action={deleteOrderAction.bind(null, order.id)}>
            <SubmitButton className="tran-label border border-tran-red px-3 py-1.5 text-xs text-tran-red transition-colors hover:bg-tran-red hover:text-tran-white">
              Ta bort ordern (permanent)
            </SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}

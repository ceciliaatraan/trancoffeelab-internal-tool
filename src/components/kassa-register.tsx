"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatOre } from "@/lib/format";
import type { KassaItem } from "@/lib/kassa/sale-lines";
import type { PosLocation } from "@/lib/kassa/locations";
import { KASSA_PLACE_COOKIE } from "@/lib/kassa/options";
import {
  addLocationAction,
  cancelSaleAction,
  declineReceiptAction,
  markSalePaidAction,
  sendReceiptAction,
  startSaleAction,
  type StartSaleResult,
} from "@/app/(kassa)/kassa/actions";

type ActiveSale = Extract<StartSaleResult, { ok: true }>;
type PaidSale = ActiveSale["sale"];

function formatSwishNumber(digits: string): string {
  return digits.length === 10 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}` : digits;
}

const optionClass = (selected: boolean) =>
  `tran-label h-11 border px-4 text-xs ${
    selected ? "border-tran-black bg-tran-black text-tran-white" : "border-tran-black hover:text-tran-red"
  }`;

/**
 * Kassan (bara Swish): välj försäljningsställe, tryck på varor, visa
 * Swish-QR (belopp och meddelande låsta) och markera som betald när kunden
 * visat betalningen i sin Swish-app - Swish Företag kan inte tala om för oss
 * att den gått igenom. Därefter frågar kassan om kunden vill ha kvitto.
 */
export function KassaRegister({
  catalog,
  locations: initialLocations,
  fixedLocation,
  initialPlace,
}: {
  catalog: KassaItem[];
  locations: PosLocation[];
  /** Satt = personen säljer alltid här och kan inte välja eller lägga till ställen. */
  fixedLocation: PosLocation | null;
  initialPlace: { locationId: string | null; note: string };
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [locations, setLocations] = useState(initialLocations);
  const [locationId, setLocationId] = useState<string | null>(
    fixedLocation?.id ?? initialPlace.locationId,
  );
  const [note, setNote] = useState(initialPlace.note);
  const [newLocationName, setNewLocationName] = useState<string | null>(null);
  const [activeSale, setActiveSale] = useState<ActiveSale | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [paidSale, setPaidSale] = useState<PaidSale | null>(null);
  const [receiptEmail, setReceiptEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Stället och anteckningen kommer ihåg mellan försäljningar på samma
  // enhet - i en cookie som kassasidan läser, så de syns direkt.
  useEffect(() => {
    document.cookie = `${KASSA_PLACE_COOKIE}=${encodeURIComponent(
      JSON.stringify({ locationId, note }),
    )}; path=/kassa; max-age=31536000; samesite=lax`;
  }, [locationId, note]);

  const lines = catalog
    .filter((item) => (cart[item.sku] ?? 0) > 0)
    .map((item) => ({ item, quantity: cart[item.sku] }));
  const totalOre = lines.reduce((sum, line) => sum + line.item.priceOre * line.quantity, 0);

  const changeQuantity = (sku: string, delta: number) => {
    setNotice(null);
    setCart((current) => {
      const next = Math.max(0, Math.min(99, (current[sku] ?? 0) + delta));
      const updated = { ...current, [sku]: next };
      if (next === 0) delete updated[sku];
      return updated;
    });
  };

  const addLocation = () => {
    if (newLocationName === null) return;
    setError(null);
    startTransition(async () => {
      const result = await addLocationAction(newLocationName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocations((current) =>
        current.some((option) => option.id === result.location.id)
          ? current
          : [...current, result.location].sort((a, b) => a.name.localeCompare(b.name, "sv")),
      );
      setLocationId(result.location.id);
      setNewLocationName(null);
    });
  };

  const startSale = () => {
    setError(null);
    setNotice(null);
    if (!locationId) {
      setError("Välj försäljningsställe först.");
      return;
    }
    startTransition(async () => {
      const result = await startSaleAction({
        lines: lines.map((line) => ({ sku: line.item.sku, quantity: line.quantity })),
        locationId,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCustomerName("");
      setActiveSale(result);
    });
  };

  const markPaid = () => {
    if (!activeSale) return;
    setError(null);
    startTransition(async () => {
      const result = await markSalePaidAction(activeSale.sale.id, customerName);
      if (!result.ok) {
        setError(result.error ?? "Kunde inte registrera betalningen.");
        return;
      }
      setPaidSale(activeSale.sale);
      setActiveSale(null);
      setCart({});
      router.refresh();
    });
  };

  const cancel = () => {
    if (!activeSale) return;
    setError(null);
    startTransition(async () => {
      await cancelSaleAction(activeSale.sale.id);
      setActiveSale(null);
      router.refresh();
    });
  };

  const finishPaid = (message: string) => {
    setNotice(message);
    setPaidSale(null);
    setReceiptEmail(null);
    setError(null);
  };

  const sendReceipt = () => {
    if (!paidSale || receiptEmail === null) return;
    setError(null);
    startTransition(async () => {
      const result = await sendReceiptAction(paidSale.id, receiptEmail);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      finishPaid(`Kassa #${paidSale.saleNumber} klar - kvitto skickat till ${result.email}.`);
      router.refresh();
    });
  };

  if (paidSale) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-6 border border-tran-black p-6 text-center">
        <p className="tran-label text-xs text-tran-green">Betald</p>
        <p className="tran-tabular text-4xl font-bold">{formatOre(paidSale.totalOre)}</p>
        <p className="text-sm">Kassa #{paidSale.saleNumber} är registrerad.</p>

        {receiptEmail === null ? (
          <>
            <p className="text-lg font-bold">Vill kunden ha ett kvitto?</p>
            <div className="flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={() => setReceiptEmail("")}
                className="tran-label h-14 w-full bg-tran-black text-sm text-tran-white"
              >
                Ja, skicka kvitto
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await declineReceiptAction(paidSale.id);
                    finishPaid(`Kassa #${paidSale.saleNumber} klar - ${formatOre(paidSale.totalOre)}.`);
                    router.refresh();
                  })
                }
                className="tran-label h-11 w-full border border-tran-black text-xs disabled:opacity-50"
              >
                Nej tack
              </button>
            </div>
          </>
        ) : (
          <form
            className="flex w-full flex-col gap-3 text-left"
            onSubmit={(event) => {
              event.preventDefault();
              sendReceipt();
            }}
          >
            <label className="tran-label text-xs text-tran-muted" htmlFor="receipt-email">
              Kundens e-post
            </label>
            <input
              id="receipt-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={receiptEmail}
              onChange={(event) => setReceiptEmail(event.target.value)}
              placeholder="namn@exempel.se"
              className="h-12 border border-tran-black px-3 text-base"
            />
            {error ? <p className="text-sm text-tran-red">{error}</p> : null}
            <button
              type="submit"
              disabled={pending}
              className="tran-label h-14 w-full bg-tran-black text-sm text-tran-white disabled:opacity-50"
            >
              Skicka kvitto
            </button>
            <button
              type="button"
              onClick={() => setReceiptEmail(null)}
              disabled={pending}
              className="tran-label h-11 w-full border border-tran-black text-xs disabled:opacity-50"
            >
              Tillbaka
            </button>
          </form>
        )}
      </section>
    );
  }

  if (activeSale) {
    const { sale, swish } = activeSale;
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-6 border border-tran-black p-6 text-center">
        <p className="tran-label text-xs text-tran-muted">Kassa #{sale.saleNumber}</p>
        <p className="tran-tabular text-4xl font-bold">{formatOre(sale.totalOre)}</p>

        {swish.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL från Swish QR-tjänst, inget att optimera
          <img src={swish.qrDataUrl} alt="Swish-QR-kod" className="h-64 w-64" />
        ) : (
          <p className="text-sm text-tran-muted">
            QR-koden kunde inte hämtas från Swish just nu - be kunden swisha för hand.
          </p>
        )}
        <div className="text-sm">
          <p>
            Swish till <span className="tran-tabular font-bold">{formatSwishNumber(swish.payee)}</span>
          </p>
          <p>
            Meddelande: <span className="font-bold">{swish.message}</span>
          </p>
        </div>
        <p className="text-xs text-tran-muted">
          Tryck på Betald när kunden visat att betalningen gått igenom i sin Swish-app.
        </p>

        <div className="flex w-full flex-col gap-1 text-left">
          <label className="tran-label text-xs text-tran-muted" htmlFor="customer-name">
            Kundens namn (valfritt)
          </label>
          <input
            id="customer-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder="Står i er Swish-app när betalningen kommit in"
            className="h-11 border border-tran-black px-3 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-tran-red">{error}</p> : null}

        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={markPaid}
            disabled={pending}
            className="tran-label h-14 w-full bg-tran-green text-sm text-tran-white disabled:opacity-50"
          >
            Betald
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="tran-label h-11 w-full border border-tran-black text-xs disabled:opacity-50"
          >
            Avbryt
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="tran-label text-xs text-tran-muted">Försäljningsställe</p>
          {fixedLocation ? (
            <p className="text-lg font-bold">{fixedLocation.name}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {locations.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLocationId(option.id)}
                    aria-pressed={locationId === option.id}
                    className={optionClass(locationId === option.id)}
                  >
                    {option.name}
                  </button>
                ))}
                {newLocationName === null ? (
                  <button
                    type="button"
                    onClick={() => setNewLocationName("")}
                    className="tran-label h-11 border border-dashed border-tran-black px-4 text-xs hover:text-tran-red"
                  >
                    + Nytt ställe
                  </button>
                ) : null}
              </div>
              {newLocationName !== null ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addLocation();
                  }}
                >
                  <input
                    value={newLocationName}
                    onChange={(event) => setNewLocationName(event.target.value)}
                    placeholder="T.ex. Kaffefestivalen 2026"
                    maxLength={60}
                    autoFocus
                    required
                    className="h-11 min-w-0 flex-1 border border-tran-black px-3 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="tran-label h-11 bg-tran-black px-4 text-xs text-tran-white disabled:opacity-50"
                  >
                    Lägg till
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLocationName(null)}
                    className="tran-label h-11 border border-tran-black px-3 text-xs"
                  >
                    Avbryt
                  </button>
                </form>
              ) : null}
            </>
          )}
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anteckning (valfritt)"
            maxLength={200}
            className="h-11 border border-tran-black px-3 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {catalog.map((item) => (
            <button
              key={item.sku}
              type="button"
              onClick={() => changeQuantity(item.sku, 1)}
              className="flex min-h-24 flex-col justify-between border border-tran-black p-3 text-left transition-colors hover:bg-tran-black hover:text-tran-white"
            >
              <span className="text-sm font-bold uppercase leading-tight">{item.name}</span>
              <span className="tran-tabular text-sm">{formatOre(item.priceOre)}</span>
            </button>
          ))}
          {catalog.length === 0 ? (
            <p className="text-sm text-tran-muted">Inga publicerade produkter att sälja.</p>
          ) : null}
        </div>
      </div>

      <aside className="flex flex-col gap-4 border border-tran-black p-4 lg:sticky lg:top-4 lg:self-start">
        <p className="tran-label text-xs text-tran-muted">Försäljning</p>
        {lines.length === 0 ? (
          <p className="text-sm text-tran-muted">Tryck på en vara för att lägga till den.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-tran-hairline">
            {lines.map(({ item, quantity }) => (
              <li key={item.sku} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="tran-tabular text-xs text-tran-muted">{formatOre(item.priceOre * quantity)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.sku, -1)}
                    aria-label={`En ${item.name} mindre`}
                    className="h-9 w-9 border border-tran-black"
                  >
                    −
                  </button>
                  <span className="tran-tabular w-6 text-center text-sm">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.sku, 1)}
                    aria-label={`En ${item.name} till`}
                    className="h-9 w-9 border border-tran-black"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-baseline justify-between border-t border-tran-black pt-3">
          <span className="tran-label text-xs">Totalt</span>
          <span className="tran-tabular text-2xl font-bold">{formatOre(totalOre)}</span>
        </div>

        {error ? <p className="text-sm text-tran-red">{error}</p> : null}
        {notice ? <p className="text-sm text-tran-green">{notice}</p> : null}

        <button
          type="button"
          onClick={startSale}
          disabled={pending || lines.length === 0}
          className="tran-label h-14 w-full bg-tran-black text-sm text-tran-white disabled:opacity-40"
        >
          Visa Swish-QR {lines.length > 0 ? formatOre(totalOre) : ""}
        </button>
      </aside>
    </section>
  );
}

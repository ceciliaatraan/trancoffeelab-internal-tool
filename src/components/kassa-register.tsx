"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatOre } from "@/lib/format";
import type { KassaItem } from "@/lib/kassa/sale-lines";
import { KASSA_PLACE_COOKIE, POS_LOCATIONS } from "@/lib/kassa/options";
import {
  cancelSaleAction,
  markSalePaidAction,
  startSaleAction,
  type StartSaleResult,
} from "@/app/(kassa)/kassa/actions";

type ActiveSale = Extract<StartSaleResult, { ok: true }>;

function formatSwishNumber(digits: string): string {
  return digits.length === 10 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}` : digits;
}

/**
 * Kassan (bara Swish): tryck på varor, visa Swish-QR (belopp och
 * meddelande låsta) och markera som betald när kunden visat kvittot i
 * sin Swish-app. Swish Företag kan inte tala om för oss att en betalning
 * gått igenom - därför trycker kassabiträdet själv på "Betald".
 */
export function KassaRegister({
  catalog,
  initialPlace,
}: {
  catalog: KassaItem[];
  initialPlace: { location: string; note: string };
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [location, setLocation] = useState(initialPlace.location);
  const [note, setNote] = useState(initialPlace.note);
  const [activeSale, setActiveSale] = useState<ActiveSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Platsen och anteckningen (t.ex. eventets namn) kommer ihåg mellan
  // försäljningar på samma enhet - i en cookie som kassasidan läser, så
  // den syns direkt utan att sidan blinkar.
  useEffect(() => {
    document.cookie = `${KASSA_PLACE_COOKIE}=${encodeURIComponent(
      JSON.stringify({ location, note }),
    )}; path=/kassa; max-age=31536000; samesite=lax`;
  }, [location, note]);

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

  const startSale = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await startSaleAction({
        lines: lines.map((line) => ({ sku: line.item.sku, quantity: line.quantity })),
        location,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActiveSale(result);
    });
  };

  const markPaid = () => {
    if (!activeSale) return;
    setError(null);
    startTransition(async () => {
      const result = await markSalePaidAction(activeSale.sale.id);
      if (!result.ok) {
        setError(result.error ?? "Kunde inte registrera betalningen.");
        return;
      }
      setNotice(`Kassa #${activeSale.sale.saleNumber} registrerad - ${formatOre(activeSale.sale.totalOre)}.`);
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
          <p className="tran-label text-xs text-tran-muted">Plats</p>
          <div className="flex flex-wrap gap-2">
            {POS_LOCATIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLocation(option.id)}
                aria-pressed={location === option.id}
                className={`tran-label h-11 border px-4 text-xs ${
                  location === option.id
                    ? "border-tran-black bg-tran-black text-tran-white"
                    : "border-tran-black hover:text-tran-red"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anteckning, t.ex. eventets namn (valfritt)"
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

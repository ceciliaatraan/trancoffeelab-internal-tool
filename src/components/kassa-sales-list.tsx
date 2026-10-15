"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatOre } from "@/lib/format";
import { POS_STATUS_LABELS } from "@/lib/kassa/options";
import type { RecentPosSale } from "@/lib/kassa/sales";
import { cancelSaleAction, refundSaleAction, sendReceiptAction } from "@/app/(kassa)/kassa/actions";
import { TableScroll } from "@/components/table-scroll";

/** De senaste kassaförsäljningarna, med Ångra (betald) och Avbryt (väntar). */
export function KassaSalesList({ sales }: { sales: RecentPosSale[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refund = (sale: RecentPosSale) => {
    const ok = window.confirm(
      `Ångra kassa #${sale.saleNumber} (${formatOre(sale.totalOre)})? Varorna läggs tillbaka i lagret. Pengarna betalar du tillbaka själv i Swish-appen.`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await refundSaleAction(sale.id);
      if (!result.ok) setError(result.error ?? "Kunde inte ångra försäljningen.");
      router.refresh();
    });
  };

  const sendReceipt = (sale: RecentPosSale) => {
    const email = window.prompt(
      `Kvitto för kassa #${sale.saleNumber} - kundens e-post:`,
      sale.receiptEmail ?? "",
    );
    if (!email) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendReceiptAction(sale.id, email);
      if (!result.ok) setError(result.error);
      else setNotice(`Kvitto för kassa #${sale.saleNumber} skickat till ${result.email}.`);
      router.refresh();
    });
  };

  const cancel = (sale: RecentPosSale) => {
    setError(null);
    startTransition(async () => {
      await cancelSaleAction(sale.id);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="tran-label text-xs text-tran-muted">Senaste försäljningar</h2>
      {error ? <p className="text-sm text-tran-red">{error}</p> : null}
      {notice ? <p className="text-sm text-tran-green">{notice}</p> : null}
      {sales.length === 0 ? (
        <p className="text-sm text-tran-muted">Inga försäljningar än.</p>
      ) : (
        <TableScroll>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Tid</th>
                <th className="py-2 pr-4 font-medium">Varor</th>
                <th className="py-2 pr-4 font-medium">Plats</th>
                <th className="py-2 pr-4 text-right font-medium">Belopp</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-tran-hairline align-top">
                  <td className="tran-tabular py-2 pr-4">{sale.saleNumber}</td>
                  <td className="tran-tabular whitespace-nowrap py-2 pr-4 text-tran-muted">
                    {formatDateTime(sale.createdAt)}
                  </td>
                  <td className="py-2 pr-4">
                    {sale.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}
                  </td>
                  <td className="py-2 pr-4">
                    {sale.location}
                    {sale.note ? <span className="text-tran-muted"> - {sale.note}</span> : null}
                  </td>
                  <td className={`tran-tabular py-2 pr-4 text-right ${sale.status === "refunded" ? "line-through text-tran-muted" : ""}`}>
                    {formatOre(sale.totalOre)}
                  </td>
                  <td className="py-2 pr-4">
                    {POS_STATUS_LABELS[sale.status] ?? sale.status}
                    {sale.receiptEmail ? (
                      <span className="block text-xs text-tran-muted">Kvitto: {sale.receiptEmail}</span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right">
                    {sale.status === "paid" ? (
                      <span className="flex justify-end gap-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => sendReceipt(sale)}
                          disabled={pending}
                          className="tran-label text-xs underline hover:text-tran-red disabled:opacity-50"
                        >
                          Kvitto
                        </button>
                        <button
                          type="button"
                          onClick={() => refund(sale)}
                          disabled={pending}
                          className="tran-label text-xs underline hover:text-tran-red disabled:opacity-50"
                        >
                          Ångra
                        </button>
                      </span>
                    ) : sale.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => cancel(sale)}
                        disabled={pending}
                        className="tran-label text-xs underline hover:text-tran-red disabled:opacity-50"
                      >
                        Avbryt
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  );
}

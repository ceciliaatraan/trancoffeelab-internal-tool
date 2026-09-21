import Link from "next/link";
import { getInventoryOverview } from "@/lib/inventory/overview";
import { getRecentStockReceipts } from "@/lib/inventory/recent-receipts";
import { formatDateTime } from "@/lib/format";
import { receiveBatchAction } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export default async function NewBatchPage({
  searchParams,
}: PageProps<"/inventory/batch">) {
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;

  const [rows, recentReceipts] = await Promise.all([
    getInventoryOverview(),
    getRecentStockReceipts(),
  ]);
  const sellableRows = rows.filter((row) => !row.isBundle && !row.hasVariants);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold uppercase tracking-tight">Ny leverans</h1>
        <Link
          href="/inventory"
          className="tran-label text-xs text-tran-muted transition-colors hover:text-tran-red"
        >
          Tillbaka till lager
        </Link>
      </div>

      <p className="max-w-xl text-sm text-tran-muted">
        Fyll i hur många av varje produkt som kom in i den här leveransen/batchen. Antalet läggs
        TILL det du redan har i lager - du behöver inte räkna ut den nya totalsumman själv. Kit
        (t.ex. Komplett Kit) räknas automatiskt utifrån komponenterna och listas inte här. Samma
        gäller produkter med varianter (t.ex. No Regrets Horse) - fyll i antalet på varianterna
        (Malet kaffe, Kaffebönor osv.) var för sig nedan.
      </p>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}

      {sellableRows.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga lagerförda produkter än.
        </div>
      ) : (
        <form action={receiveBatchAction} className="flex flex-col gap-6">
          <div>
            <label className="tran-label mb-1.5 block text-xs text-tran-muted" htmlFor="label">
              Batchnamn/referens (valfritt)
            </label>
            <input
              id="label"
              name="label"
              placeholder="T.ex. Batch 2 - fler Phin"
              className="w-full max-w-md border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none"
            />
          </div>

          <table className="w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-3 pr-4 font-medium">Produkt</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">I lager just nu</th>
                <th className="py-3 pr-4 font-medium">Antal som kom in</th>
              </tr>
            </thead>
            <tbody>
              {sellableRows.map((row) => (
                <tr key={row.inventoryId} className="border-b border-tran-hairline">
                  <td className="py-3 pr-4 align-top">
                    {row.productName}
                    {row.variantName ? ` - ${row.variantName}` : ""}
                  </td>
                  <td className="tran-tabular py-3 pr-4 align-top text-tran-muted">{row.sku}</td>
                  <td className="tran-tabular py-3 pr-4 align-top text-tran-muted">
                    {row.quantity}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <input
                      type="number"
                      name={`qty_${row.inventoryId}`}
                      min={0}
                      defaultValue={0}
                      className="w-24 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <SubmitButton className="tran-label border border-tran-black px-4 py-2.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
              Registrera leverans
            </SubmitButton>
          </div>
        </form>
      )}

      {recentReceipts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="tran-label text-xs text-tran-muted">Senaste leveranser/justeringar</h2>
          <table className="w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                <th className="py-2 pr-4 font-medium">Produkt</th>
                <th className="py-2 pr-4 font-medium">Antal</th>
                <th className="py-2 pr-4 font-medium">Anteckning</th>
                <th className="py-2 pr-4 font-medium">Datum</th>
              </tr>
            </thead>
            <tbody>
              {recentReceipts.map((receipt, index) => (
                <tr key={index} className="border-b border-tran-hairline">
                  <td className="py-2 pr-4 text-tran-muted">
                    {receipt.productName}
                    {receipt.variantName ? ` - ${receipt.variantName}` : ""}
                  </td>
                  <td className="tran-tabular py-2 pr-4">+{receipt.changeAmount}</td>
                  <td className="py-2 pr-4 text-tran-muted">{receipt.note ?? "-"}</td>
                  <td className="tran-tabular py-2 pr-4 text-tran-muted">
                    {formatDateTime(receipt.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

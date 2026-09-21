import Link from "next/link";
import { getInventoryOverview } from "@/lib/inventory/overview";
import { getRecentStockBatches } from "@/lib/inventory/recent-receipts";
import { formatDateTime } from "@/lib/format";
import { receiveBatchAction } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export default async function NewBatchPage({
  searchParams,
}: PageProps<"/inventory/batch">) {
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;

  const [rows, recentBatches] = await Promise.all([
    getInventoryOverview(),
    getRecentStockBatches(),
  ]);
  const sellableRows = rows.filter((row) => !row.isBundle);
  const rowByInventoryId = new Map(rows.map((row) => [row.inventoryId, row]));

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
                <th className="py-3 pr-4 font-medium">Tillgängligt just nu</th>
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
                    {row.sellableQuantity ?? row.quantity}
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

      {recentBatches.length > 0 ? (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="tran-label text-xs text-tran-muted">Tidigare batcher/leveranser</h2>
            <p className="mt-1 max-w-xl text-xs text-tran-muted">
              Visar vad som kom in i varje batch och produktens NUVARANDE totala lager bredvid -
              inte exakt hur mycket som är kvar just från den batchen (det kräver att varje
              försändelse spåras för sig, vilket vi inte gör).
            </p>
          </div>
          {recentBatches.map((batch, index) => (
            <div key={index} className="border border-tran-hairline p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="tran-label text-xs">{batch.note ?? "Ny leverans"}</p>
                <p className="tran-tabular text-xs text-tran-muted">
                  {formatDateTime(batch.createdAt)}
                </p>
              </div>
              <table className="w-full max-w-2xl border-collapse text-sm">
                <thead>
                  <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                    <th className="py-2 pr-4 font-medium">Produkt</th>
                    <th className="py-2 pr-4 font-medium">Kom in</th>
                    <th className="py-2 pr-4 font-medium">I lager nu</th>
                    <th className="py-2 pr-4 font-medium">Tillgängligt nu</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.lines.map((line) => {
                    const current = rowByInventoryId.get(line.inventoryId);
                    return (
                      <tr key={line.inventoryId} className="border-b border-tran-hairline last:border-0">
                        <td className="py-2 pr-4 text-tran-muted">
                          {line.productName}
                          {line.variantName ? ` - ${line.variantName}` : ""}
                        </td>
                        <td className="tran-tabular py-2 pr-4">+{line.receivedQuantity}</td>
                        <td className="tran-tabular py-2 pr-4 text-tran-muted">
                          {current ? current.available : "-"}
                        </td>
                        <td className="tran-tabular py-2 pr-4 text-tran-muted">
                          {current?.sellableQuantity ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

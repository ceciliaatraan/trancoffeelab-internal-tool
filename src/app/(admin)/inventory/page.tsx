import { getInventoryOverview } from "@/lib/inventory/overview";
import { adjustInventory } from "./actions";

const inputClass =
  "w-20 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";

export default async function InventoryPage({
  searchParams,
}: PageProps<"/inventory">) {
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;

  const rows = await getInventoryOverview();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Lager</h1>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}

      {rows.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga lagerrader än.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
              <th className="py-3 pr-4 font-medium">Produkt</th>
              <th className="py-3 pr-4 font-medium">SKU</th>
              <th className="py-3 pr-4 font-medium">I lager</th>
              <th className="py-3 pr-4 font-medium">Reserverat</th>
              <th className="py-3 pr-4 font-medium">Larmnivå</th>
              <th className="py-3 pr-4 font-medium">Justera</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const belowAlarm = row.available <= row.alarmLevel;
              return (
                <tr key={row.inventoryId} className="border-b border-tran-hairline">
                  <td className="py-4 pr-4 align-top">
                    {row.productName}
                    {row.variantName ? ` — ${row.variantName}` : ""}
                    {row.isBundle && row.bundleBreakdown ? (
                      <ul className="mt-1 text-xs text-tran-muted">
                        {row.bundleBreakdown.map((component) => (
                          <li key={component.name}>
                            {component.name}: {component.available} i lager
                            {component.quantityPerBundle > 1
                              ? ` (${component.quantityPerBundle}/kit)`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                    {row.sku}
                  </td>
                  <td
                    className={`tran-tabular py-4 pr-4 align-top ${belowAlarm ? "text-tran-red" : ""}`}
                  >
                    {row.available}
                    {belowAlarm ? " — Slut i lager" : ""}
                  </td>
                  <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                    {row.isBundle ? "—" : row.reservedQuantity}
                  </td>
                  <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                    {row.alarmLevel}
                  </td>
                  <td className="py-4 pr-4 align-top">
                    {row.isBundle ? (
                      <p className="text-xs text-tran-muted">
                        Beräknas automatiskt utifrån komponenterna till vänster.
                      </p>
                    ) : (
                      <form action={adjustInventory} className="flex items-center gap-2">
                        <input type="hidden" name="inventoryId" value={row.inventoryId} />
                        <input
                          name="newQuantity"
                          type="number"
                          min={0}
                          required
                          defaultValue={row.quantity}
                          className={inputClass}
                        />
                        <select
                          name="reason"
                          defaultValue="manual_adjustment"
                          className={inputClass}
                        >
                          <option value="manual_adjustment">Justering</option>
                          <option value="return">Retur</option>
                        </select>
                        <input
                          name="note"
                          placeholder="Anteckning (valfritt)"
                          className="w-36 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="tran-label border border-tran-black px-2 py-1.5 text-[11px] transition-colors hover:border-tran-red hover:text-tran-red"
                        >
                          Spara
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

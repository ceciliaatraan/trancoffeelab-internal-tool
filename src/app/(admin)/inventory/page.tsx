import Link from "next/link";
import { getInventoryOverview } from "@/lib/inventory/overview";
import {
  adjustInventory,
  reconcileReservedQuantitiesAction,
  registerInternalUseAction,
  setAllowBackorderAction,
} from "./actions";
import { INTERNAL_USE_PURPOSES } from "@/lib/inventory/internal-use-purposes";
import { getRecentInternalUse } from "@/lib/inventory/recent-internal-use";
import { formatDateTime } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { TableScroll } from "@/components/table-scroll";

const inputClass =
  "w-20 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";

type InventoryRow = Awaited<ReturnType<typeof getInventoryOverview>>[number];

const stackedInputClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-2 text-sm focus:border-tran-black focus:outline-none";

/** "Sälj vid slut"-knappen - samma i tabellen och i mobilens kort. */
function backorderControl(row: InventoryRow) {
  if (row.isBundle) {
    return (
      <p className="max-w-36 text-xs text-tran-muted">
        {row.allowBackorder ? "Ja - alla komponenter" : "Styrs av komponenterna"}
      </p>
    );
  }
  return (
    <form action={setAllowBackorderAction}>
      <input type="hidden" name="inventoryId" value={row.inventoryId} />
      <input type="hidden" name="allow" value={row.allowBackorder ? "0" : "1"} />
      <SubmitButton
        className={`tran-label border px-2 py-1.5 text-[11px] transition-colors ${
          row.allowBackorder
            ? "border-tran-black bg-tran-black text-tran-white hover:border-tran-red hover:bg-tran-red"
            : "border-tran-hairline text-tran-muted hover:border-tran-black hover:text-tran-black"
        }`}
      >
        {row.allowBackorder ? "På" : "Av"}
      </SubmitButton>
    </form>
  );
}

/** Justera-formuläret; `stacked` = mobilens kort, med fälten under varandra. */
function adjustControl(row: InventoryRow, stacked: boolean) {
  if (row.isBundle) {
    return (
      <p className="text-xs text-tran-muted">
        Beräknas automatiskt utifrån {stacked ? "komponenterna" : "komponenterna till vänster"}.
      </p>
    );
  }
  const fieldClass = stacked ? stackedInputClass : inputClass;
  return (
    <form
      action={adjustInventory}
      className={stacked ? "grid grid-cols-2 gap-2" : "flex items-center gap-2"}
    >
      <input type="hidden" name="inventoryId" value={row.inventoryId} />
      <input
        name="newQuantity"
        type="number"
        min={0}
        required
        defaultValue={row.quantity}
        aria-label="I lager"
        className={fieldClass}
      />
      <select name="reason" defaultValue="manual_adjustment" aria-label="Orsak" className={fieldClass}>
        <option value="manual_adjustment">Justering</option>
        <option value="return">Retur</option>
      </select>
      <input
        name="note"
        placeholder="Anteckning (valfritt)"
        className={`${stacked ? "col-span-2 w-full py-2" : "w-36 py-1.5"} border border-tran-hairline bg-tran-white px-2 text-sm focus:border-tran-black focus:outline-none`}
      />
      <SubmitButton
        className={`tran-label border border-tran-black px-2 text-[11px] transition-colors hover:border-tran-red hover:text-tran-red ${stacked ? "col-span-2 py-2.5" : "py-1.5"}`}
      >
        Spara
      </SubmitButton>
    </form>
  );
}

export default async function InventoryPage({
  searchParams,
}: PageProps<"/inventory">) {
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const reconciled = typeof search.reconciled === "string" ? Number(search.reconciled) : null;
  const batchReceived =
    typeof search.batchReceived === "string" ? Number(search.batchReceived) : null;

  const saved = "saved" in search;
  const internalUse =
    typeof search.internalUse === "string" ? Number(search.internalUse) : null;

  const [rows, recentInternalUse] = await Promise.all([
    getInventoryOverview(),
    getRecentInternalUse(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-4xl font-bold uppercase tracking-tight">Lager</h1>
        <div className="flex flex-wrap items-start gap-4">
          <Link
            href="/inventory/batch"
            className="tran-label border border-tran-black px-4 py-2.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
          >
            Ny leverans
          </Link>
          <form action={reconcileReservedQuantitiesAction}>
            <SubmitButton className="tran-label border border-tran-black px-4 py-2.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
              Synka lager
            </SubmitButton>
            <p className="mt-1.5 max-w-xs text-xs text-tran-muted">
              Siffrorna nedan är alltid rätträknade. Den här knappen rättar bara vad hemsidans
              kassa internt tror är ledigt att sälja (reserverat + skickat) - klicka om något
              nyligen kändes fel där.
            </p>
          </form>
        </div>
      </div>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {reconciled !== null ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          {reconciled === 0
            ? "Lagret stämde redan - inga rader behövde rättas."
            : `Lager synkat - ${reconciled} ${reconciled === 1 ? "rad" : "rader"} rättades.`}
        </p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">Sparat.</p>
      ) : null}
      {internalUse !== null ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          Eget uttag registrerat - {internalUse} st dragna från lagret.
        </p>
      ) : null}
      {batchReceived !== null ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">
          Leverans registrerad - {batchReceived} {batchReceived === 1 ? "produkt" : "produkter"}{" "}
          uppdaterades.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga lagerrader än.
        </div>
      ) : (
        <>
          {/* Mobil: ett kort per lagerrad i stället för den breda tabellen. */}
          <ul className="-mx-4 divide-y divide-tran-hairline border-y border-tran-hairline md:hidden">
            {rows.map((row) => {
              const belowAlarm = row.available <= row.alarmLevel;
              const stats: { label: string; value: number; red?: boolean }[] = [
                ...(row.isBundle ? [] : [{ label: "I lager", value: row.available, red: belowAlarm }]),
                { label: "Reserverat", value: row.reservedQuantity },
                { label: "Skickat", value: row.shippedQuantity },
                {
                  label: "Tillgängligt",
                  value: row.sellableQuantity,
                  red: (row.isBundle && belowAlarm) || row.sellableQuantity < 0,
                },
                { label: "Larmnivå", value: row.alarmLevel },
              ];
              return (
                <li key={row.inventoryId} className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
                      {row.productName}
                      {row.variantName ? ` - ${row.variantName}` : ""}
                    </p>
                    <span className="tran-tabular shrink-0 text-xs text-tran-muted">{row.sku}</span>
                  </div>
                  {row.isBundle && row.bundleBreakdown ? (
                    <ul className="text-xs text-tran-muted">
                      {row.bundleBreakdown.map((component) => (
                        <li key={component.name}>
                          {component.name}: {component.available} i lager
                          {component.quantityPerBundle > 1 ? ` (${component.quantityPerBundle}/kit)` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-2">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <dt className="tran-label text-[10px] text-tran-muted">{stat.label}</dt>
                        <dd className={`tran-tabular text-sm ${stat.red ? "text-tran-red" : ""}`}>
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex items-center justify-between gap-3">
                    <span className="tran-label text-[10px] text-tran-muted">Sälj vid slut i lager</span>
                    {backorderControl(row)}
                  </div>
                  {adjustControl(row, true)}
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <TableScroll>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                    <th className="py-3 pr-4 font-medium">Produkt</th>
                    <th className="py-3 pr-4 font-medium">SKU</th>
                    <th className="py-3 pr-4 font-medium">I lager</th>
                    <th className="py-3 pr-4 font-medium">Reserverat</th>
                    <th className="py-3 pr-4 font-medium">Skickat</th>
                    <th className="py-3 pr-4 font-medium">Tillgängligt</th>
                    <th className="py-3 pr-4 font-medium">Larmnivå</th>
                    <th className="py-3 pr-4 font-medium">Sälj vid slut</th>
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
                          {row.variantName ? ` - ${row.variantName}` : ""}
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
                          className={`tran-tabular py-4 pr-4 align-top ${!row.isBundle && belowAlarm ? "text-tran-red" : ""}`}
                        >
                          {row.isBundle ? "-" : row.available}
                          {!row.isBundle && belowAlarm ? " - Slut i lager" : ""}
                        </td>
                        <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                          {row.reservedQuantity}
                        </td>
                        <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                          {row.shippedQuantity}
                        </td>
                        <td
                          className={`tran-tabular py-4 pr-4 align-top font-medium ${(row.isBundle && belowAlarm) || row.sellableQuantity < 0 ? "text-tran-red" : ""}`}
                        >
                          {row.sellableQuantity}
                          {row.sellableQuantity < 0
                            ? " - minuslager"
                            : row.isBundle && belowAlarm
                              ? " - Slut i lager"
                              : ""}
                        </td>
                        <td className="tran-tabular py-4 pr-4 align-top text-tran-muted">
                          {row.alarmLevel}
                        </td>
                        <td className="py-4 pr-4 align-top">
                          {backorderControl(row)}
                        </td>
                        <td className="py-4 pr-4 align-top">
                          {adjustControl(row, false)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </>
      )}

      <p className="text-xs text-tran-muted">
        <span className="font-medium">Sälj vid slut i lager:</span> när den är &quot;På&quot;
        fortsätter hemsidan sälja varan även när Tillgängligt är 0 - det blir minuslager (negativt
        tal i Tillgängligt) som fylls på när ni registrerar nästa leverans under &quot;Ny
        leverans&quot;. Ett kit säljs vidare bara om alla dess komponenter har den påslagen.
      </p>

      <section id="eget-uttag" className="flex flex-col gap-4 border border-tran-hairline p-6">
        <h2 className="tran-label text-xs text-tran-muted">Eget uttag</h2>
        <p className="text-xs text-tran-muted">
          Varor ni tagit ur lagret själva - till eget bruk, kaffe till marknadsföring, event o.s.v.
          Dras från &quot;I lager&quot;. Ett kit dras från sina komponenter.
        </p>
        <form action={registerInternalUseAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="tran-label mb-1 block text-[11px] text-tran-muted">Vara</label>
            <select
              name="inventoryId"
              required
              defaultValue=""
              className="border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
            >
              <option value="" disabled>
                Välj vara…
              </option>
              {rows.map((row) => (
                <option key={row.inventoryId} value={row.inventoryId}>
                  {row.productName}
                  {row.variantName ? ` - ${row.variantName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tran-label mb-1 block text-[11px] text-tran-muted">Antal</label>
            <input name="quantity" type="number" min={1} required defaultValue={1} className={inputClass} />
          </div>
          <div>
            <label className="tran-label mb-1 block text-[11px] text-tran-muted">Användes till</label>
            <select
              name="purpose"
              required
              defaultValue="marketing"
              className="border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
            >
              {Object.entries(INTERNAL_USE_PURPOSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tran-label mb-1 block text-[11px] text-tran-muted">
              Anteckning (valfritt)
            </label>
            <input
              name="note"
              placeholder="T.ex. provsmakning på Café X"
              className="w-56 border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none"
            />
          </div>
          <SubmitButton className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red">
            Registrera uttag
          </SubmitButton>
        </form>

        {recentInternalUse.length > 0 ? (
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="tran-label border-b border-tran-hairline text-left text-xs text-tran-muted">
                  <th className="py-2 pr-4 font-medium">Datum</th>
                  <th className="py-2 pr-4 font-medium">Vara</th>
                  <th className="py-2 pr-4 font-medium">Antal</th>
                  <th className="py-2 pr-4 font-medium">Användes till</th>
                </tr>
              </thead>
              <tbody>
                {recentInternalUse.map((entry) => (
                  <tr key={entry.id} className="border-b border-tran-hairline">
                    <td className="tran-tabular py-2 pr-4 text-tran-muted">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="py-2 pr-4">
                      {entry.productName}
                      {entry.variantName ? ` - ${entry.variantName}` : ""}
                    </td>
                    <td className="tran-tabular py-2 pr-4">{entry.quantity}</td>
                    <td className="py-2 pr-4 text-tran-muted">{entry.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : null}
      </section>
    </div>
  );
}

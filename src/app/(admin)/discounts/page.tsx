import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireCurrentAdmin } from "@/lib/current-admin";
import { formatOre } from "@/lib/format";
import { oreToKronorInput, hundredthsToPercentInput } from "@/lib/money-input";
import { DiscountValueField } from "@/components/discount-value-field";
import { createDiscountAction, updateDiscountAction } from "./actions";

const inputClass =
  "w-full border border-tran-hairline bg-tran-white px-2 py-1.5 text-sm focus:border-tran-black focus:outline-none";
const labelClass = "tran-label mb-1 block text-[11px] text-tran-muted";

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const appliesToLabels: Record<"products" | "shipping" | "both", string> = {
  products: "Produkter",
  shipping: "Frakt",
  both: "Produkter + frakt",
};

export default async function DiscountsPage({ searchParams }: PageProps<"/discounts">) {
  const admin = await requireCurrentAdmin();
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const saved = "saved" in search;

  const discounts = await db
    .select()
    .from(schema.discountCodes)
    .orderBy(desc(schema.discountCodes.createdAt));

  const isOwner = admin.role === "owner";

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Rabattkoder</h1>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">Sparat.</p>
      ) : null}
      {!isOwner ? (
        <p className="text-sm text-tran-muted">
          Endast ägare kan skapa eller ändra rabattkoder. Du ser listan skrivskyddad.
        </p>
      ) : null}

      {discounts.length === 0 ? (
        <div className="border border-tran-hairline p-12 text-center text-tran-muted">
          Inga rabattkoder än.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {discounts.map((discount) =>
            isOwner ? (
              <form
                key={discount.id}
                action={updateDiscountAction.bind(null, discount.id)}
                className="grid grid-cols-2 gap-3 border border-tran-hairline p-4 sm:grid-cols-4"
              >
                <div>
                  <label className={labelClass}>Kod</label>
                  <input name="code" defaultValue={discount.code} required className={inputClass} />
                </div>
                <DiscountValueField
                  defaultType={discount.type}
                  defaultValue={
                    discount.type === "percentage"
                      ? hundredthsToPercentInput(discount.value)
                      : oreToKronorInput(discount.value)
                  }
                />
                <div>
                  <label className={labelClass}>Gäller för</label>
                  <select name="appliesTo" defaultValue={discount.appliesTo} className={inputClass}>
                    <option value="products">Produkter</option>
                    <option value="shipping">Frakt</option>
                    <option value="both">Produkter + frakt</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Använd</label>
                  <p className="tran-tabular py-1.5 text-sm">
                    {discount.usedCount}
                    {discount.maxUses ? ` / ${discount.maxUses}` : ""}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Giltig från</label>
                  <input
                    name="validFrom"
                    type="date"
                    defaultValue={toDateInputValue(discount.validFrom)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Giltig till</label>
                  <input
                    name="validUntil"
                    type="date"
                    defaultValue={toDateInputValue(discount.validUntil)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max antal användningar</label>
                  <input
                    name="maxUses"
                    type="number"
                    min={1}
                    defaultValue={discount.maxUses ?? ""}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Minsta ordervärde (kr)</label>
                  <input
                    name="minOrderValue"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      discount.minOrderValueOre != null
                        ? oreToKronorInput(discount.minOrderValueOre)
                        : ""
                    }
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-4 sm:col-span-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={discount.active}
                      className="h-4 w-4"
                    />
                    Aktiv
                  </label>
                  <button
                    type="submit"
                    className="tran-label border border-tran-black px-3 py-1.5 text-xs transition-colors hover:border-tran-red hover:text-tran-red"
                  >
                    Spara
                  </button>
                </div>
              </form>
            ) : (
              <div key={discount.id} className="border border-tran-hairline p-4 text-sm">
                <p className="tran-label text-xs">{discount.code}</p>
                <p className="text-tran-muted">
                  {discount.type === "percentage"
                    ? `${(discount.value / 100).toLocaleString("sv-SE")}%`
                    : formatOre(discount.value)}
                  {" på "}
                  {appliesToLabels[discount.appliesTo]}
                  {" - "}
                  {discount.active ? "Aktiv" : "Inaktiv"} - använd {discount.usedCount}
                  {discount.maxUses ? ` / ${discount.maxUses}` : ""} gånger
                </p>
              </div>
            ),
          )}
        </div>
      )}

      {isOwner ? (
        <section className="flex flex-col gap-4">
          <h2 className="tran-label text-xs text-tran-muted">Ny rabattkod</h2>
          <form
            action={createDiscountAction}
            className="grid grid-cols-2 gap-3 border border-tran-hairline p-4 sm:grid-cols-4"
          >
            <div>
              <label className={labelClass}>Kod</label>
              <input name="code" required className={inputClass} />
            </div>
            <DiscountValueField />
            <div>
              <label className={labelClass}>Gäller för</label>
              <select name="appliesTo" defaultValue="products" className={inputClass}>
                <option value="products">Produkter</option>
                <option value="shipping">Frakt</option>
                <option value="both">Produkter + frakt</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Giltig från</label>
              <input name="validFrom" type="date" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Giltig till</label>
              <input name="validUntil" type="date" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Max antal användningar</label>
              <input name="maxUses" type="number" min={1} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Minsta ordervärde (kr)</label>
              <input name="minOrderValue" type="number" min={0} step="0.01" className={inputClass} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
                Aktiv
              </label>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <button
                type="submit"
                className="border border-tran-black bg-tran-black px-6 py-2.5 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red"
              >
                Skapa rabattkod
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

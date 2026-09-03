type ProductFormValues = {
  slug?: string;
  nameSv?: string;
  nameEn?: string;
  descriptionSv?: string | null;
  descriptionEn?: string | null;
  sku?: string;
  priceOre?: number;
  taxRate?: number;
  weightGrams?: number;
  status?: string;
  sortOrder?: number;
  isPreorder?: boolean;
  expectedShipDate?: string | null;
};

const inputClass =
  "w-full border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none";
const labelClass = "tran-label mb-1.5 block text-xs text-tran-muted";

export function ProductForm({
  action,
  values,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: ProductFormValues;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            defaultValue={values?.slug}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sku">
            SKU
          </label>
          <input
            id="sku"
            name="sku"
            defaultValue={values?.sku}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="nameSv">
            Namn (svenska)
          </label>
          <input
            id="nameSv"
            name="nameSv"
            defaultValue={values?.nameSv}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="nameEn">
            Namn (engelska)
          </label>
          <input
            id="nameEn"
            name="nameEn"
            defaultValue={values?.nameEn}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="descriptionSv">
            Beskrivning (svenska)
          </label>
          <textarea
            id="descriptionSv"
            name="descriptionSv"
            defaultValue={values?.descriptionSv ?? ""}
            rows={4}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="descriptionEn">
            Beskrivning (engelska)
          </label>
          <textarea
            id="descriptionEn"
            name="descriptionEn"
            defaultValue={values?.descriptionEn ?? ""}
            rows={4}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="priceOre">
            Pris i öre (14900 = 149,00 kr)
          </label>
          <input
            id="priceOre"
            name="priceOre"
            type="number"
            min={0}
            defaultValue={values?.priceOre}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="taxRate">
            Moms i hundradels procent (2500 = 25%)
          </label>
          <input
            id="taxRate"
            name="taxRate"
            type="number"
            min={0}
            max={10000}
            defaultValue={values?.taxRate}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="weightGrams">
            Vikt (gram)
          </label>
          <input
            id="weightGrams"
            name="weightGrams"
            type="number"
            min={1}
            defaultValue={values?.weightGrams}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={values?.status ?? "draft"}
            className={inputClass}
          >
            <option value="draft">Utkast</option>
            <option value="published">Publicerad</option>
            <option value="archived">Arkiverad</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="sortOrder">
            Sorteringsordning
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={values?.sortOrder ?? 0}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-2 pb-2.5">
          <input
            id="isPreorder"
            name="isPreorder"
            type="checkbox"
            defaultChecked={values?.isPreorder ?? false}
            className="h-4 w-4 border border-tran-hairline"
          />
          <label className="text-sm" htmlFor="isPreorder">
            Förbeställning
          </label>
        </div>
        <div>
          <label className={labelClass} htmlFor="expectedShipDate">
            Beräknad leverans (visas som månad/period för kund)
          </label>
          <input
            id="expectedShipDate"
            name="expectedShipDate"
            type="date"
            defaultValue={values?.expectedShipDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="border border-tran-black bg-tran-black px-6 py-2.5 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

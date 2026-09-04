import { requireCurrentAdmin } from "@/lib/current-admin";
import { getShopSettings } from "@/lib/settings";
import { formatOre } from "@/lib/format";
import { updateShippingSettingsAction } from "./actions";

const inputClass =
  "w-48 border border-tran-hairline bg-tran-white px-3 py-2 text-sm focus:border-tran-black focus:outline-none";
const labelClass = "tran-label mb-1.5 block text-xs text-tran-muted";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const admin = await requireCurrentAdmin();
  const settings = await getShopSettings();
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : null;
  const saved = "saved" in search;

  const allowedEmails = (process.env.ALLOWED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const allowedHd = process.env.ALLOWED_GOOGLE_HD?.trim();
  const kustomEnv = process.env.KUSTOM_ENV ?? "okänd";

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <h1 className="text-4xl font-bold uppercase tracking-tight">Inställningar</h1>

      {error ? (
        <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p>
      ) : null}
      {saved ? (
        <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">Sparat.</p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Frakt och moms</h2>
        {admin.role === "owner" ? (
          <form action={updateShippingSettingsAction} className="flex flex-wrap gap-6">
            <div>
              <label className={labelClass} htmlFor="shippingFlatRateOre">
                Fraktkostnad (öre)
              </label>
              <input
                id="shippingFlatRateOre"
                name="shippingFlatRateOre"
                type="number"
                min={0}
                defaultValue={settings.shippingFlatRateOre}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="shippingTaxRate">
                Moms på frakt (hundradels procent, 2500 = 25%)
              </label>
              <input
                id="shippingTaxRate"
                name="shippingTaxRate"
                type="number"
                min={0}
                max={10000}
                defaultValue={settings.shippingTaxRate}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="freeShippingThresholdOre">
                Fri frakt från (öre, tomt = ingen fri frakt)
              </label>
              <input
                id="freeShippingThresholdOre"
                name="freeShippingThresholdOre"
                type="number"
                min={0}
                defaultValue={settings.freeShippingThresholdOre ?? ""}
                className={inputClass}
              />
            </div>
            <div className="w-full">
              <button
                type="submit"
                className="border border-tran-black bg-tran-black px-6 py-2.5 text-sm font-medium text-tran-white transition-colors hover:border-tran-red hover:bg-tran-red"
              >
                Spara
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="tran-label text-xs text-tran-muted">Fraktkostnad</dt>
              <dd className="tran-tabular">{formatOre(settings.shippingFlatRateOre)}</dd>
            </div>
            <div>
              <dt className="tran-label text-xs text-tran-muted">Moms på frakt</dt>
              <dd className="tran-tabular">
                {(settings.shippingTaxRate / 100).toLocaleString("sv-SE")}%
              </dd>
            </div>
            <div>
              <dt className="tran-label text-xs text-tran-muted">Fri frakt från</dt>
              <dd className="tran-tabular">
                {settings.freeShippingThresholdOre
                  ? formatOre(settings.freeShippingThresholdOre)
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
        {admin.role !== "owner" ? (
          <p className="text-sm text-tran-muted">
            Endast ägare kan ändra frakt- och momsinställningar.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Kustom</h2>
        <p className="text-sm">
          Miljö: <span className="tran-tabular">{kustomEnv}</span>
        </p>
        <p className="text-sm text-tran-muted">
          Byts genom att ändra KUSTOM_API_BASE_URL/KUSTOM_ENV i Vercels
          miljövariabler — inte här.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">
          Tillåtna Google-adresser (skrivskyddat)
        </h2>
        <ul className="text-sm">
          {allowedEmails.length > 0 ? (
            allowedEmails.map((email) => <li key={email}>{email}</li>)
          ) : (
            <li className="text-tran-muted">Ingen adress konfigurerad.</li>
          )}
        </ul>
        {allowedHd ? (
          <p className="text-sm text-tran-muted">Begränsad till Workspace-domän: {allowedHd}</p>
        ) : null}
        <p className="text-sm text-tran-muted">
          Ändras i Vercels miljövariabel ALLOWED_ADMIN_EMAILS, inte här.
        </p>
      </section>
    </div>
  );
}

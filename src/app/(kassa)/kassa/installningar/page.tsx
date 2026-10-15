import Link from "next/link";
import { redirect } from "next/navigation";
import { requireKassaUser } from "@/lib/current-admin";
import { getFixedLocations, getLocationStats } from "@/lib/kassa/locations";
import { SubmitButton } from "@/components/submit-button";
import { LocationOrderList } from "@/components/location-order-list";
import {
  createLocationFormAction,
  removeFixedLocationAction,
  setFixedLocationFormAction,
} from "./actions";

const inputClass =
  "h-11 border border-tran-black bg-tran-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-tran-black";
const buttonClass =
  "tran-label h-11 border border-tran-black px-4 text-xs transition-colors hover:border-tran-red hover:text-tran-red";

/**
 * Försäljningsställen (Restaurang TRAN, Event, egna event) med försäljning
 * per ställe, och vilka som alltid säljer på ett fast ställe. Bara ägare och
 * personal - kassabiträden skickas tillbaka till kassan.
 */
export default async function KassaSettingsPage({ searchParams }: PageProps<"/kassa/installningar">) {
  const user = await requireKassaUser();
  if (user.role === "cashier") redirect("/kassa");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const saved = "saved" in params;
  const [stats, fixed] = await Promise.all([getLocationStats(), getFixedLocations()]);
  const active = stats.filter((location) => !location.archived);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link href="/kassa" className="text-sm text-tran-muted hover:text-tran-red">
          ← Kassan
        </Link>
        <h1 className="text-2xl font-bold uppercase tracking-tight sm:text-4xl">Försäljningsställen</h1>
      </div>

      {error ? <p className="border border-tran-red px-4 py-3 text-sm text-tran-red">{error}</p> : null}
      {saved ? <p className="border border-tran-hairline px-4 py-3 text-sm text-tran-muted">Sparat.</p> : null}

      <section className="flex flex-col gap-4">
        <p className="text-sm text-tran-muted">
          Varje kassaköp sparas med sitt försäljningsställe, så det syns var försäljningen kommer
          ifrån. Lägg till ett ställe per event. Dra i ⋮⋮ för att ändra i vilken ordning ställena
          visas i kassan. Ett arkiverat ställe går inte att välja i kassan, men dess försäljning
          finns kvar.
        </p>
        <LocationOrderList
          // Ny lista (och ny ordning från servern) när ställen läggs till, arkiveras eller säljer.
          key={stats.map((location) => `${location.id}:${location.archived}:${location.allTimeOre}`).join("|")}
          locations={stats}
        />
        <form action={createLocationFormAction} className="flex flex-wrap gap-2">
          <input
            name="name"
            required
            maxLength={60}
            placeholder="Nytt ställe, t.ex. Kaffefestivalen 2026"
            aria-label="Nytt försäljningsställe"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <SubmitButton className={buttonClass}>Lägg till</SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Fast försäljningsställe per person</h2>
        <p className="text-sm text-tran-muted">
          Den som står här säljer alltid på sitt ställe i kassan och kan varken välja eller lägga
          till andra ställen - och ser bara det ställets försäljning. Alla andra väljer själva.
        </p>
        {fixed.length > 0 ? (
          <ul className="flex flex-col divide-y divide-tran-hairline border-y border-tran-hairline">
            {fixed.map((entry) => (
              <li key={entry.email} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 break-all">{entry.email}</span>
                <span className="flex items-center gap-4">
                  <span className="text-tran-muted">{entry.locationName}</span>
                  <form action={removeFixedLocationAction.bind(null, entry.email)}>
                    <SubmitButton className="tran-label text-xs underline hover:text-tran-red">Ta bort</SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tran-muted">Ingen har ett fast ställe.</p>
        )}
        <form action={setFixedLocationFormAction} className="flex flex-wrap gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="E-post (Google-kontot personen loggar in med)"
            aria-label="E-post"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <select name="locationId" required aria-label="Försäljningsställe" className={inputClass} defaultValue="">
            <option value="" disabled>
              Välj ställe…
            </option>
            {active.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <SubmitButton className={buttonClass}>Spara</SubmitButton>
        </form>
      </section>
    </div>
  );
}

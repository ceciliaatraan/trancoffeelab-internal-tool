import Link from "next/link";
import { cookies } from "next/headers";
import { requireKassaUser } from "@/lib/current-admin";
import { getKassaCatalog, getRecentSales } from "@/lib/kassa/sales";
import { getActiveLocations, getFixedLocationForEmail, getLocationStats } from "@/lib/kassa/locations";
import { KASSA_PLACE_COOKIE, parseKassaPlace } from "@/lib/kassa/options";
import { KassaRegister } from "@/components/kassa-register";
import { KassaSalesList } from "@/components/kassa-sales-list";
import { formatOreWhole } from "@/lib/format";

export default async function KassaPage() {
  const seller = await requireKassaUser();
  const fixedLocation = await getFixedLocationForEmail(seller.email);
  const saved = parseKassaPlace((await cookies()).get(KASSA_PLACE_COOKIE)?.value);

  const [catalog, locations, recentSales, stats] = await Promise.all([
    getKassaCatalog(),
    getActiveLocations(),
    getRecentSales(30, fixedLocation?.id),
    getLocationStats(),
  ]);

  // Senast valda ställe på enheten, om det fortfarande finns - annars det första.
  const initialLocationId =
    fixedLocation?.id ??
    locations.find((location) => location.id === saved.locationId)?.id ??
    locations[0]?.id ??
    null;
  const todayStats = stats.filter((row) =>
    fixedLocation ? row.id === fixedLocation.id : !row.archived || row.todayOre > 0,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <KassaRegister
        catalog={catalog}
        locations={locations}
        fixedLocation={fixedLocation}
        initialPlace={{ locationId: initialLocationId, note: saved.note }}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="tran-label text-xs text-tran-muted">Idag</h2>
          {seller.role !== "cashier" ? (
            <Link href="/kassa/installningar" className="text-sm text-tran-muted hover:text-tran-red">
              Försäljningsställen →
            </Link>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {todayStats.map((location) => (
            <div key={location.id} className="border border-tran-hairline p-4">
              <p className="tran-label text-xs text-tran-muted">{location.name}</p>
              <p className="tran-tabular text-xl">{formatOreWhole(location.todayOre)}</p>
            </div>
          ))}
        </div>
      </section>

      <KassaSalesList sales={recentSales} />
    </div>
  );
}

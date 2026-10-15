import { cookies } from "next/headers";
import { requireKassaUser } from "@/lib/current-admin";
import { getKassaCatalog, getPaidTotalsByLocation, getRecentSales } from "@/lib/kassa/sales";
import { KASSA_PLACE_COOKIE, POS_LOCATIONS, parseKassaPlace } from "@/lib/kassa/options";
import { KassaRegister } from "@/components/kassa-register";
import { KassaSalesList } from "@/components/kassa-sales-list";
import { formatOreWhole } from "@/lib/format";

export default async function KassaPage() {
  await requireKassaUser();
  const initialPlace = parseKassaPlace((await cookies()).get(KASSA_PLACE_COOKIE)?.value);

  const [catalog, recentSales, todayTotals] = await Promise.all([
    getKassaCatalog(),
    getRecentSales(30),
    getPaidTotalsByLocation("day"),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <KassaRegister catalog={catalog} initialPlace={initialPlace} />

      <section className="flex flex-col gap-4">
        <h2 className="tran-label text-xs text-tran-muted">Idag</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {POS_LOCATIONS.map((location) => (
            <div key={location.id} className="border border-tran-hairline p-4">
              <p className="tran-label text-xs text-tran-muted">{location.label}</p>
              <p className="tran-tabular text-xl">{formatOreWhole(todayTotals.get(location.id) ?? 0)}</p>
            </div>
          ))}
        </div>
      </section>

      <KassaSalesList sales={recentSales} />
    </div>
  );
}

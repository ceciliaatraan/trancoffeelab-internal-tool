const STOCKHOLM_TZ = "Europe/Stockholm";

const dayKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TZ,
  day: "numeric",
  month: "short",
});

/**
 * "YYYY-MM-DD" i svensk lokal tid, inte serverns UTC (samma distinktion
 * som formatDateTime i lib/format.ts) - annars hamnar ordrar lagda sent
 * på kvällen i fel dagshink i diagrammet.
 */
export function stockholmDayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

/**
 * Föregående kalenderdag för en "YYYY-MM-DD"-nyckel, räknat rent på
 * datumkomponenterna (inte via en tidszon-omvandlad instant) - så
 * sommar-/vintertidsskiften aldrig kan hoppa över eller dubbla en dag.
 */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}

/** Klockan tolv UTC för en dagsnyckel - långt från midnatt i alla riktiga tidszoner, så formatering av datumet blir aldrig fel dag. */
export function dayKeyToNoonUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function dayKeyLabel(dayKey: string): string {
  return dayLabelFormatter.format(dayKeyToNoonUtc(dayKey));
}

function isoWeekday(dayKey: string): number {
  const day = dayKeyToNoonUtc(dayKey).getUTCDay();
  return day === 0 ? 7 : day;
}

export type DailySales = {
  dayKey: string;
  label: string;
  totalOre: number;
  orderCount: number;
};

export type DashboardSummary = {
  todayOre: number;
  weekOre: number;
  monthOre: number;
  monthOrderCount: number;
  monthAvgOrderOre: number;
};

/**
 * Härlett direkt ur samma dagsvisa siffror som diagrammet ritar - så
 * KPI-korten och diagrammet ALDRIG kan visa olika "idag"/"denna vecka"
 * på grund av två olika sätt att räkna dagsgränser.
 */
export function summarizeDailySales(daily: DailySales[]): DashboardSummary {
  const todayKey = daily.length > 0 ? daily[daily.length - 1].dayKey : stockholmDayKey(new Date());
  const mondayOffset = isoWeekday(todayKey) - 1;
  let mondayKey = todayKey;
  for (let i = 0; i < mondayOffset; i++) mondayKey = previousDayKey(mondayKey);

  const currentMonthPrefix = todayKey.slice(0, 7);

  let todayOre = 0;
  let weekOre = 0;
  let monthOre = 0;
  let monthOrderCount = 0;

  for (const day of daily) {
    if (day.dayKey === todayKey) todayOre = day.totalOre;
    if (day.dayKey >= mondayKey) weekOre += day.totalOre;
    if (day.dayKey.startsWith(currentMonthPrefix)) {
      monthOre += day.totalOre;
      monthOrderCount += day.orderCount;
    }
  }

  return {
    todayOre,
    weekOre,
    monthOre,
    monthOrderCount,
    monthAvgOrderOre: monthOrderCount > 0 ? Math.round(monthOre / monthOrderCount) : 0,
  };
}

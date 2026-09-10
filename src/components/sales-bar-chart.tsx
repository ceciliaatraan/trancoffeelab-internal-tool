import type { DailySales } from "@/lib/dashboard/stats";
import { formatOre } from "@/lib/format";

/**
 * Handskriven, server-renderad SVG - inget diagram-bibliotek, matchar
 * hur adminet i övrigt bygger UI (inga klientkomponenter för sånt som
 * kan renderas rent). viewBox + preserveAspectRatio="none" gör staplarna
 * responsiva utan JS; exakt belopp/datum kommer via <title> (nativ
 * webbläsar-tooltip vid hovring, ingen JS krävs).
 */
export function SalesBarChart({ data }: { data: DailySales[] }) {
  const max = Math.max(1, ...data.map((d) => d.totalOre));
  const unit = 10;
  const width = data.length * unit;
  const height = 100;
  const barGap = 2;
  const barWidth = unit - barGap * 2;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-40 w-full"
        role="img"
        aria-label="Försäljning per dag"
      >
        <line
          x1="0"
          y1={height - 0.5}
          x2={width}
          y2={height - 0.5}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((day, index) => {
          const barHeight = day.totalOre === 0 ? 0 : Math.max(2, (day.totalOre / max) * height);
          const x = index * unit + barGap;
          const y = height - barHeight;
          const isToday = index === data.length - 1;
          return (
            <rect
              key={day.dayKey}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={isToday ? "#EB1C24" : "#000000"}
            >
              <title>
                {day.label}: {formatOre(day.totalOre)} ({day.orderCount}{" "}
                {day.orderCount === 1 ? "order" : "ordrar"})
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex text-[10px] text-tran-muted">
        {data.map((day, index) => (
          <div
            key={day.dayKey}
            className="tran-tabular flex-1 text-center"
            style={{ visibility: shouldShowLabel(index, data.length) ? "visible" : "hidden" }}
          >
            {day.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Visar bara var N:e datumetikett när det är många staplar, annars blir det för trångt. */
function shouldShowLabel(index: number, total: number): boolean {
  if (total <= 14) return true;
  const step = Math.ceil(total / 10);
  return index % step === 0 || index === total - 1;
}

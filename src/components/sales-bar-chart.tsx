"use client";

import { useState } from "react";
import type { DailySales } from "@/lib/dashboard/stats";
import { formatOre } from "@/lib/format";

/**
 * Handskriven SVG, inget diagram-bibliotek - matchar hur adminet i
 * övrigt bygger UI. Klientkomponent (till skillnad från resten av
 * adminet): en nativ SVG <title> är en webbläsarstyrd tooltip med en
 * inbyggd fördröjning (~1s) som inte går att korta ner med CSS - för en
 * tooltip som visas DIREKT vid hovring krävs egen positionerad
 * tooltip-ruta i stället, vilket kräver JS (hover-state).
 *
 * viewBox + preserveAspectRatio="none" gör staplarna responsiva utan
 * JS för själva layouten - tooltip-rutan positioneras med procent
 * (vänster/nederkant) inom samma ruta som SVG:n, vilket stämmer exakt
 * eftersom viewBox sträcks till 100% bredd/höjd.
 */
export function SalesBarChart({ data }: { data: DailySales[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.totalOre));
  const unit = 10;
  const width = data.length * unit;
  const height = 100;
  const barGap = 2;
  const barWidth = unit - barGap * 2;
  const barHeightFor = (day: DailySales) =>
    day.totalOre === 0 ? 0 : Math.max(2, (day.totalOre / max) * height);

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredBarHeightPercent =
    hoveredIndex !== null ? (barHeightFor(data[hoveredIndex]) / height) * 100 : 0;
  const hoveredLeftPercent =
    hoveredIndex !== null ? ((hoveredIndex + 0.5) / data.length) * 100 : 0;

  return (
    <div>
      <div className="relative">
        {hovered ? (
          <div
            className="tran-tabular pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap border border-tran-black bg-tran-white px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${hoveredLeftPercent}%`,
              bottom: `calc(${hoveredBarHeightPercent}% + 8px)`,
            }}
          >
            {hovered.label}: {formatOre(hovered.totalOre)} ({hovered.orderCount}{" "}
            {hovered.orderCount === 1 ? "order" : "ordrar"})
          </div>
        ) : null}
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
            const barHeight = barHeightFor(day);
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
              />
            );
          })}
          {/* Osynliga, fullhöga träffytor - annars går det bara att hovra
              exakt på den smala stapeln, inte hela kolumnens bredd. */}
          {data.map((day, index) => (
            <rect
              key={`${day.dayKey}-hit`}
              x={index * unit}
              y={0}
              width={unit}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
            />
          ))}
        </svg>
      </div>
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

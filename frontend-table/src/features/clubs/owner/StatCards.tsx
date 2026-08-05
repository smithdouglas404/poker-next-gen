"use client";

import type { ReactNode } from "react";

import { PLATE, TEXT_KPI, cn } from "@/features/ui/tokens";

/**
 * KPI ribbon — the M1 PLATE tier of the material ramp.
 *
 * These were M2 grey cards with a 1px accent bar and a 30px value, so they
 * weighed exactly the same as the chart card and the data table below them and
 * nothing led the eye. In the reference comps the KPI row is the one solid-gold
 * element on the screen, with BLACK ink and a black sparkline — that single
 * contrast step is most of what makes the hierarchy read.
 *
 * One M1 group per screen. If a second gold row appears, neither leads.
 */
export interface StatCard {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /**
   * Retained so every existing caller keeps compiling, but it no longer drives
   * the fill: on M1 every tile is gold. Colour-coding the KPI row is what made
   * the four tiles compete with each other instead of with the rest of the
   * page. It now only tints the sub-line.
   */
  accent?: "cyan" | "gold" | "green" | "red";
  /** Optional trend for the sparkline. Fewer than 2 points renders no line. */
  series?: number[];
}

/** Black sparkline across the foot of a gold plate. Ink on metal, not a glow. */
function Spark({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const W = 100;
  const H = 22;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const d = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - ((v - min) / span) * H;
      return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="mt-3 h-6 w-full">
      <path d={d} fill="none" stroke="#1a1206" strokeOpacity="0.5" strokeWidth="1.6" />
    </svg>
  );
}

export function StatCards({ cards, cols = 4 }: { cards: StatCard[]; cols?: 4 | 5 }) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        cols === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
      )}
    >
      {cards.map((c) => (
        <div key={c.label} className={cn(PLATE, "flex min-h-[120px] flex-col p-5")}>
          <p className="font-display text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#1a1206]/70">
            {c.label}
          </p>
          <p className={cn(TEXT_KPI, "mt-1 text-[#1a1206]")}>{c.value}</p>
          {c.sub && <p className="mt-1.5 text-[11px] font-semibold text-[#1a1206]/65">{c.sub}</p>}
          <div className="mt-auto">
            <Spark series={c.series ?? []} />
          </div>
        </div>
      ))}
    </div>
  );
}

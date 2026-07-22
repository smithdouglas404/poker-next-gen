"use client";

// Dependency-free inline-SVG stat visuals for the Profile analytics block.
// No chart library (per UI_REBUILD_PLAN §3.8: "charts via new SVG set").
// All labels/values render in the DOM — SVG carries geometry only.

import { cn } from "@/features/ui/tokens";

const CYAN = "#81ecff";
const GOLD = "#d4af37";

/**
 * RadialGauge — a threshold-gated donut showing a poker % stat against an
 * "ideal" band. Cyan primary arc; the ideal band is a faint gold underlay so
 * the player can read at a glance whether they are inside a healthy range.
 */
export function RadialGauge({
  label,
  value,
  max = 100,
  ideal,
  accent = CYAN,
  suffix = "%",
}: {
  label: string;
  value: number;
  max?: number;
  ideal?: [number, number];
  accent?: string;
  suffix?: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = c * pct;

  // Optional ideal band drawn as a faint gold arc segment.
  let bandDash: string | undefined;
  let bandOffset = 0;
  if (ideal) {
    const start = Math.max(0, Math.min(1, ideal[0] / max));
    const end = Math.max(0, Math.min(1, ideal[1] / max));
    const seg = Math.max(0, end - start) * c;
    bandDash = `${seg} ${c - seg}`;
    bandOffset = -start * c;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[92px] w-[92px]">
        <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90">
          <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {bandDash && (
            <circle
              cx="46"
              cy="46"
              r={r}
              fill="none"
              stroke={GOLD}
              strokeOpacity="0.35"
              strokeWidth="8"
              strokeDasharray={bandDash}
              strokeDashoffset={bandOffset}
            />
          )}
          <circle
            cx="46"
            cy="46"
            r={r}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ filter: `drop-shadow(0 0 6px ${accent}66)`, transition: "stroke-dasharray 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-bold text-foreground">
            {Number.isInteger(value) ? value : value.toFixed(2)}
            <span className="text-[11px] text-neutral-400">{suffix}</span>
          </span>
        </div>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{label}</span>
    </div>
  );
}

/**
 * StatMeter — a labelled horizontal bar with an optional ideal marker. Used for
 * the secondary analytics (WSD%, win rate).
 */
export function StatMeter({
  label,
  value,
  max = 100,
  ideal,
  accent = CYAN,
  suffix = "%",
}: {
  label: string;
  value: number;
  max?: number;
  ideal?: number;
  accent?: string;
  suffix?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const idealPct = ideal !== undefined ? Math.max(0, Math.min(1, ideal / max)) * 100 : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{label}</span>
        <span className="font-display text-sm font-bold text-foreground">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          <span className="text-[10px] text-neutral-500">{suffix}</span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent}88, ${accent})`,
            boxShadow: `0 0 10px ${accent}55`,
            transition: "width 700ms ease",
          }}
        />
        {idealPct !== undefined && (
          <div
            className="absolute top-0 h-full w-px bg-gold/70"
            style={{ left: `${idealPct}%`, boxShadow: "0 0 6px rgba(212,175,55,0.6)" }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * NetTile — the headline net-winnings figure, colored by sign.
 */
export function NetTile({ label, value, cents }: { label: string; value: string; cents: number }) {
  const positive = cents >= 0;
  return (
    <div className="flex flex-col justify-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-bold tracking-tight",
          positive ? "text-emerald-300" : "text-red-300",
        )}
        style={{ textShadow: positive ? "0 0 14px rgba(52,211,153,0.25)" : "0 0 14px rgba(248,113,113,0.25)" }}
      >
        {value}
      </span>
    </div>
  );
}

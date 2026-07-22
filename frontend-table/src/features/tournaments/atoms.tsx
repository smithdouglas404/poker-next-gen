"use client";

import type { ReactNode } from "react";

import { cn } from "@/features/ui/tokens";

import type { LobbyMeta } from "./types";

// GGPoker chip tones: gold = rewards/premium, green = money/positive,
// red = brand/hot. Cyan + purple are retired → clean neutral chips.
const TONE: Record<NonNullable<LobbyMeta["tagTone"]>, string> = {
  gold: "border-gold/40 bg-gold/10 text-gold",
  cyan: "border-white/15 bg-white/[0.05] text-neutral-300",
  green: "border-green/40 bg-green/10 text-green",
  purple: "border-white/15 bg-white/[0.05] text-neutral-300",
  red: "border-brand/45 bg-brand/10 text-[#ff2d3f]",
};

export function Tag({
  children,
  tone = "cyan",
  className,
}: {
  children: ReactNode;
  tone?: LobbyMeta["tagTone"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]",
        TONE[tone ?? "cyan"],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small labelled stat column used in hero cards and rows. */
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "cyan" | "gold" | "green";
  className?: string;
}) {
  const valueTone =
    tone === "cyan"
      ? "text-green"
      : tone === "gold"
        ? "text-gold"
        : tone === "green"
          ? "text-green"
          : "text-white";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className={cn("mt-1 font-display text-lg font-bold tabular-nums", valueTone)}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-neutral-500">{unit}</span>}
      </p>
    </div>
  );
}

/** A larger KPI tile (Active Tables / Total Prize Pool / Projected Revenue). */
export function KpiTile({
  label,
  value,
  tone = "cyan",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "cyan" | "gold" | "green";
  hint?: string;
}) {
  const valueTone = tone === "gold" ? "text-gold" : tone === "green" ? "text-green" : "text-foreground";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#1c2128] px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className={cn("mt-1.5 font-display text-2xl font-bold tabular-nums", valueTone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

/** Round icon tile used at the left of each event row. */
export function RowIcon({ tone = "cyan", glyph }: { tone?: LobbyMeta["tagTone"]; glyph: string }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg",
        TONE[tone ?? "cyan"],
      )}
    >
      {glyph}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">{children}</p>
  );
}

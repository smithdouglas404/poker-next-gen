"use client";

import type { ReactNode } from "react";

import { cn } from "@/features/ui/tokens";

import type { LobbyMeta } from "./types";

const TONE: Record<NonNullable<LobbyMeta["tagTone"]>, string> = {
  gold: "border-gold/40 bg-gold/10 text-gold",
  cyan: "border-cyan/40 bg-cyan/10 text-cyan",
  green: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  purple: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  red: "border-red-400/40 bg-red-400/10 text-red-300",
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
      ? "text-cyan"
      : tone === "gold"
        ? "text-gold"
        : tone === "green"
          ? "text-emerald-300"
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
  const valueTone = tone === "gold" ? "text-gold" : tone === "green" ? "text-emerald-300" : "text-cyan";
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 backdrop-blur-xl">
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
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan/70">{children}</p>
  );
}

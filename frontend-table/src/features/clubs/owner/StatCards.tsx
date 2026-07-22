"use client";

import type { ReactNode } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

export interface StatCard {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent: "cyan" | "gold" | "green" | "red";
}

const ACCENT: Record<StatCard["accent"], { bar: string; text: string; subText: string }> = {
  cyan: { bar: "#22d3ee", text: "text-cyan", subText: "text-cyan/70" },
  gold: { bar: "#d4af37", text: "text-gold", subText: "text-gold/70" },
  green: { bar: "#33d17a", text: "text-emerald-300", subText: "text-emerald-300/70" },
  red: { bar: "#ff3b46", text: "text-red-300", subText: "text-red-300/80" },
};

export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const a = ACCENT[c.accent];
        return (
          <div key={c.label} className={cn(GLASS_PANEL, "relative overflow-hidden p-4 pl-5")}>
            <span
              className="absolute left-0 top-0 h-full w-1"
              style={{ background: a.bar, boxShadow: `0 0 16px ${a.bar}` }}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
              {c.label}
            </p>
            <p className={cn("font-display mt-1.5 text-3xl font-bold leading-none", a.text)}>
              {c.value}
            </p>
            {c.sub && <p className={cn("mt-2 text-[11px]", a.subText)}>{c.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

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
  cyan: { bar: "#9aa0a6", text: "text-foreground", subText: "text-muted" },
  gold: { bar: "#f5c518", text: "text-gold", subText: "text-gold/70" },
  green: { bar: "#22c55e", text: "text-green", subText: "text-green/70" },
  red: { bar: "#e01e2b", text: "text-brand", subText: "text-brand/80" },
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
              style={{ background: a.bar }}
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

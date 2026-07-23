"use client";

// A small chip that labels the settlement mode of a money figure (P0-7). Use it
// next to a balance/credit so a player can tell cash from play chips from
// club-internal credit at a glance. Cash renders nothing by default (the "$" is
// self-explanatory); chips and club credit always show a qualifier.

import { cn } from "@/features/ui/tokens";
import { type MoneyMode, moneyModeLabel, moneyModeHint } from "./money";

const STYLE: Record<MoneyMode, string> = {
  cash: "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#4ade80]",
  chips: "border-white/20 bg-white/[0.06] text-white/70",
  club: "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]",
};

export function MoneyModeTag({
  mode,
  className,
  showCash = false,
}: {
  mode: MoneyMode;
  className?: string;
  showCash?: boolean;
}) {
  if (mode === "cash" && !showCash) return null;
  return (
    <span
      title={moneyModeHint(mode)}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        STYLE[mode],
        className,
      )}
    >
      {moneyModeLabel(mode)}
    </span>
  );
}

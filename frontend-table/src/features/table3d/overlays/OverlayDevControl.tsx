"use client";

// Small dev control (demo only) to open each of the six in-table overlay states
// without a live server, so the owner can review them at /table?demo=1. It is a
// review affordance — it never renders on a real (non-demo) table.

import { useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

export type OverlayDemoState =
  | "summary" // Final Hand History Log + Financial Summary
  | "paused" // Game Paused by Admin
  | "settings" // Comprehensive Admin Table Settings
  | "report" // Player Game Report
  | "kickban" // Player Kick/Ban Confirmation
  | "news"; // Breaking News

const ITEMS: Array<{ id: OverlayDemoState; label: string }> = [
  { id: "summary", label: "Hand History + Financials" },
  { id: "paused", label: "Game Paused by Admin" },
  { id: "settings", label: "Admin Table Settings" },
  { id: "report", label: "Player Game Report" },
  { id: "kickban", label: "Player Kick / Ban" },
  { id: "news", label: "Breaking News" },
];

export function OverlayDevControl({ onOpen }: { onOpen: (state: OverlayDemoState) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-30 flex w-60 flex-col items-start gap-2">
      {open && (
        <div className={cn(GLASS_PANEL, "w-full overflow-hidden border-white/10")}>
          {ITEMS.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onOpen(it.id)}
              className="flex w-full items-center justify-between border-b border-white/[0.06] px-3 py-2 text-left text-[12px] text-neutral-200 transition-colors last:border-b-0 hover:bg-white/[0.05]"
            >
              {it.label}
              <span aria-hidden className="text-gold">↗</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          GLASS_PANEL,
          "flex items-center gap-2 rounded-lg border-gold/25 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gold hover:border-gold/50",
        )}
      >
        <span aria-hidden>🎬</span> Demo Overlays
      </button>
    </div>
  );
}

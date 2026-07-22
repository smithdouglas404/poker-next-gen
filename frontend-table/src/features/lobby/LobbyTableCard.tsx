"use client";

import type { TableListItem } from "@/features/game/protocol";
import { BTN_RED, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

// Neon Vault glass table thumbnail for the lobby grid. Seat pips encode
// occupancy; the join CTA is gated by real open-seat count from table_list.
export function LobbyTableCard({
  table,
  buyInLabel,
  onJoin,
  busy,
}: {
  table: TableListItem;
  buyInLabel: string;
  onJoin: () => void;
  busy: boolean;
}) {
  const seated = table.seated ?? 0;
  const open = table.open_seats ?? Math.max(0, 6 - seated);
  const capacity = seated + open || 6;
  const full = open <= 0;
  const name = table.room_id || table.label || "Hold'em Table";

  return (
    <article
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "group relative flex flex-col overflow-hidden p-5",
      )}
    >
      {/* felt glow bed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-16 h-24 rounded-[999px] opacity-70 blur-2xl transition group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(closest-side, rgba(28,125,78,0.55), rgba(15,95,57,0.15), transparent)",
        }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
            {name}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Buy-in {buyInLabel}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            full
              ? "bg-white/5 text-neutral-400"
              : "bg-green/15 text-green",
          )}
        >
          {full ? "Full" : "Live"}
        </span>
      </div>

      {/* seat ring */}
      <div className="relative mt-5 mb-4 flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: capacity }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-6 w-6 rounded-full border transition",
                i < seated
                  ? "border-gold/50 bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] shadow-[0_0_10px_rgba(245,197,24,0.3)]"
                  : "border-white/10 bg-white/[0.02]",
              )}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-300">
          <span className="font-semibold text-foreground">{seated}</span>/{capacity} seated ·{" "}
          <span className="text-green">{open} open</span>
        </p>
      </div>

      <button
        type="button"
        disabled={busy || full}
        onClick={onJoin}
        className={cn(
          "w-full rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition",
          "disabled:cursor-not-allowed disabled:opacity-40",
          full
            ? "border border-white/15 text-neutral-400"
            : cn(BTN_RED, "shadow-none"),
        )}
      >
        {full ? "Table Full" : busy ? "Joining…" : "Take a Seat"}
      </button>
      <p className="mt-2 truncate font-mono text-[9px] text-neutral-600">{table.match_id}</p>
    </article>
  );
}

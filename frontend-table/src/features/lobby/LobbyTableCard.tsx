"use client";
// ── LobbyTableCard v2 — Premium dark-casino table thumbnail ──────────────────
// Felt glow, seat-ring occupancy, gold/green accent system, richer typography.
import type { TableListItem } from "@/features/game/protocol";
import { BTN_RED, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

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
  const seated   = table.seated ?? 0;
  const open     = table.open_seats ?? Math.max(0, 6 - seated);
  const capacity = seated + open || 6;
  const full     = open <= 0;
  const name     = table.room_id || table.label || "Hold'em Table";
  const pct      = capacity > 0 ? seated / capacity : 0;

  return (
    <article
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "group relative flex flex-col overflow-hidden rounded-2xl p-0",
      )}
    >
      {/* Top accent bar */}
      <div
        className="h-px w-full"
        style={{
          background: full
            ? "linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)"
            : "linear-gradient(90deg,transparent,rgba(34,197,94,0.50),transparent)",
        }}
      />

      {/* Felt glow bed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-12 h-20 rounded-[999px] opacity-60 blur-2xl transition group-hover:opacity-90"
        style={{
          background: "radial-gradient(closest-side,rgba(28,125,78,0.55),rgba(15,95,57,0.12),transparent)",
        }}
      />

      <div className="relative flex flex-col gap-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-white leading-tight">
              {name}
            </h3>
            <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-neutral-500">
              Buy-in {buyInLabel}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider",
              full
                ? "border border-white/10 bg-white/[0.03] text-neutral-500"
                : "border border-green/30 bg-green/[0.10] text-green",
            )}
          >
            {full ? "Full" : "● Live"}
          </span>
        </div>

        {/* Seat ring */}
        <div className="flex flex-col items-center gap-3 py-2">
          {/* Oval felt */}
          <div className="relative flex h-14 w-28 items-center justify-center rounded-[999px] border border-[#f5c518]/20"
            style={{ background: "radial-gradient(ellipse,rgba(28,125,78,0.45),rgba(10,60,35,0.60))" }}>
            <span className="font-display text-xs font-bold text-[#f5c518]/70">♠</span>
          </div>

          {/* Seat pips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {Array.from({ length: capacity }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-5 w-5 rounded-full border transition-all duration-200",
                  i < seated
                    ? "border-[#f5c518]/60 bg-gradient-to-br from-[#ffe066] to-[#c9a000] shadow-[0_0_8px_rgba(245,197,24,0.35)]"
                    : "border-white/10 bg-white/[0.02]",
                )}
              />
            ))}
          </div>

          {/* Occupancy label */}
          <p className="text-xs text-neutral-400">
            <span className="font-semibold text-white">{seated}</span>/{capacity} seated ·{" "}
            <span className="font-semibold text-green">{open} open</span>
          </p>
        </div>

        {/* Fill bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct * 100}%`,
              background: pct > 0.8
                ? "linear-gradient(90deg,#e01e2b,#ff4455)"
                : "linear-gradient(90deg,#22c55e,#4ade80)",
            }}
          />
        </div>

        {/* Blinds row */}
        {(table.small_blind || table.big_blind) && (
          <div className="flex items-center justify-between text-[10px] text-neutral-500">
            <span>Blinds</span>
            <span className="font-semibold text-neutral-300">
              {table.small_blind}/{table.big_blind}
            </span>
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          disabled={busy || full}
          onClick={onJoin}
          className={cn(
            "w-full rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition",
            "disabled:cursor-not-allowed disabled:opacity-40",
            full
              ? "border border-white/10 text-neutral-500"
              : cn(BTN_RED, "shadow-[0_2px_12px_rgba(224,30,43,0.30)]"),
          )}
        >
          {full ? "Table Full" : busy ? "Joining…" : "Take a Seat →"}
        </button>

        {/* Match ID */}
        <p className="truncate font-mono text-[9px] text-neutral-700">{table.match_id}</p>
      </div>
    </article>
  );
}

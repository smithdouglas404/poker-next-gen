"use client";

import { useMemo } from "react";

import { formatCents } from "@/features/game/GameProvider";
import type { TableListItem } from "@/features/game/protocol";
import { BTN_RED, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

import { DEMO_PUBLIC_TABLES, type PublicTableRow } from "./lobbyData";

// The HRC "Public Lobby" list: one row per open table — felt icon, name,
// occupancy 5/10 with a seat bar, host, and a gold Join CTA. Live rows come from
// the `table_list` RPC (via GameProvider.openTables); when none are live and the
// session is offline, clearly-labeled demo rows are shown instead.

export function PublicLobbyList({
  liveTables,
  connected,
  busy,
  query,
  onJoin,
}: {
  liveTables: TableListItem[];
  connected: boolean;
  busy: boolean;
  query: string;
  onJoin: (matchId: string) => void;
}) {
  const rows = useMemo<PublicTableRow[]>(() => {
    if (liveTables.length > 0) {
      return liveTables.map((t) => {
        const seated = t.seated ?? 0;
        const open = t.open_seats ?? Math.max(0, 6 - seated);
        return {
          match_id: t.match_id,
          name: t.room_id || t.label || "Hold'em Table",
          seated,
          capacity: seated + open || 6,
          buy_in_minor: 100000,
          host: "Table Host",
        };
      });
    }
    // No live tables: demo fallback only when there is no backend session.
    return connected ? [] : DEMO_PUBLIC_TABLES;
  }, [liveTables, connected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  if (filtered.length === 0) {
    return (
      <div className={cn(GLASS_PANEL, "p-8 text-center text-sm text-neutral-400")}>
        {query.trim()
          ? "No tables match your search."
          : "No open tables yet — create a private table or find a quick match above."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((r) => {
        const full = r.seated >= r.capacity;
        const pct = Math.min(100, Math.round((r.seated / r.capacity) * 100));
        return (
          <article
            key={r.match_id}
            className={cn(
              GLASS_PANEL,
              GLASS_PANEL_HOVER,
              "flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap",
            )}
          >
            {/* felt icon */}
            <div
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/40"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(28,125,78,0.9), rgba(15,95,57,0.5))",
                boxShadow: "inset 0 0 10px rgba(0,0,0,0.5)",
              }}
            >
              <span className="text-[10px] font-bold text-gold">♦</span>
            </div>

            <div className="min-w-[9rem] flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
                  {r.name}
                </h3>
                {r.demo && (
                  <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                    Demo
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                Buy-in {formatCents(r.buy_in_minor)}
              </p>
            </div>

            {/* occupancy bar */}
            <div className="w-40 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400">Seats</span>
                <span className="font-semibold text-foreground">
                  {r.seated}
                  <span className="text-neutral-500">/{r.capacity}</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0a7d43] to-[#22c55e]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* host */}
            <div className="hidden items-center gap-2 sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 text-[10px] text-neutral-300">
                {r.host.slice(0, 1)}
              </span>
              <span className="text-xs text-neutral-400">{r.host}</span>
            </div>

            <button
              type="button"
              disabled={busy || full || !!r.demo}
              onClick={() => onJoin(r.match_id)}
              className={cn(
                "shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition",
                "disabled:cursor-not-allowed disabled:opacity-40",
                full || r.demo
                  ? "border border-white/15 text-neutral-400"
                  : cn(BTN_RED, "shadow-none"),
              )}
            >
              {r.demo ? "Demo" : full ? "Full" : "Join"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

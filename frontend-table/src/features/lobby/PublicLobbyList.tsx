"use client";

import { useMemo, useState } from "react";

import { formatCents } from "@/features/game/GameProvider";
import type { TableListItem } from "@/features/game/protocol";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

import {
  DEMO_PUBLIC_TABLES,
  STAKE_TIERS,
  classifyStakes,
  rowsFromLiveTables,
  type PublicTableRow,
  type StakeTier,
} from "./lobbyData";

// The HRC "Public Lobby" list (detailed_20): one row per open cash table — felt
// icon, name, blind levels (100/200), a 5/10 seat bar, host, and a gold Join
// CTA — with Low/Medium/High stakes filters. Live rows come from the
// `table_list` RPC (via GameProvider.openTables) and carry parsed blinds from
// the match label; when none are live and the session is offline, clearly
// labeled demo rows are shown instead.

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
  const [stakes, setStakes] = useState<Set<StakeTier>>(new Set());

  const rows = useMemo<PublicTableRow[]>(() => {
    if (liveTables.length > 0) return rowsFromLiveTables(liveTables);
    // No live tables: demo fallback only when there is no backend session.
    return connected ? [] : DEMO_PUBLIC_TABLES;
  }, [liveTables, connected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (stakes.size > 0) {
        const tier = classifyStakes(r.big_blind_minor ?? 0);
        if (!stakes.has(tier)) return false;
      }
      return true;
    });
  }, [rows, query, stakes]);

  const toggleStake = (t: StakeTier) =>
    setStakes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="space-y-3">
      {/* stakes filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Stakes
        </span>
        {STAKE_TIERS.map((s) => {
          const active = stakes.has(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggleStake(s.value)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition",
                active
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : "border-white/12 bg-white/[0.02] text-neutral-400 hover:border-white/30",
              )}
            >
              {s.label}
            </button>
          );
        })}
        {stakes.size > 0 && (
          <button
            type="button"
            onClick={() => setStakes(new Set())}
            className="text-[10px] uppercase tracking-wider text-neutral-500 transition hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className={cn(GLASS_PANEL, "p-8 text-center text-sm text-neutral-400")}>
          {query.trim() || stakes.size > 0
            ? "No tables match your filters."
            : "No open tables yet — create a private table or find a quick match above."}
        </div>
      ) : (
        filtered.map((r) => {
          const full = r.seated >= r.capacity;
          const pct = Math.min(100, Math.round((r.seated / r.capacity) * 100));
          const blinds =
            r.big_blind_minor && r.small_blind_minor
              ? `${r.small_blind_minor / 100}/${r.big_blind_minor / 100}`
              : formatCents(r.buy_in_minor);
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

              {/* blind levels */}
              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Blinds</p>
                <p className="font-display text-base font-bold text-green">{blinds}</p>
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
                    className="h-full rounded-full bg-gradient-to-r from-[#c9a227] to-[#f5c518]"
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
                  "shrink-0 rounded-full px-6 py-2 text-sm font-bold uppercase tracking-wide transition",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  full || r.demo
                    ? "border border-white/15 text-neutral-400"
                    : BTN_GOLD,
                )}
              >
                {r.demo ? "Demo" : full ? "Full" : "Join"}
              </button>
            </article>
          );
        })
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import type { TableListItem } from "@/features/game/protocol";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

import {
  DEMO_BROWSER_TABLES,
  GAME_TYPE_OPTIONS,
  STAKE_TIERS,
  classifyStakes,
  rowsFromLiveTables,
  type PublicTableRow,
  type StakeTier,
} from "./lobbyData";

// The HRC "Classic Public Game Browser" (detailed_13) — a card grid of open
// public games with a Stakes multi-select (Low / Medium / High) and a Game Type
// dropdown. Each card shows a LIVE badge, felt thumbnail, Table Name, Blind
// Levels and Players, and a gold JOIN TABLE CTA. Live rows come from the
// `table_list` RPC (GameProvider.openTables); offline/guest sessions fall back
// to clearly-labeled demo rows so the browser always reads intentionally.

export function PublicGameBrowser({
  liveTables,
  connected,
  busy,
  onJoin,
  onBack,
}: {
  liveTables: TableListItem[];
  connected: boolean;
  busy: boolean;
  onJoin: (matchId: string) => void;
  onBack: () => void;
}) {
  const [stakes, setStakes] = useState<Set<StakeTier>>(new Set());
  const [gameType, setGameType] = useState("all");

  const rows = useMemo<PublicTableRow[]>(() => {
    if (liveTables.length > 0) return rowsFromLiveTables(liveTables);
    return connected ? [] : DEMO_BROWSER_TABLES;
  }, [liveTables, connected]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (gameType !== "all" && (r.variant ?? "holdem") !== gameType) return false;
      if (stakes.size > 0) {
        const tier = classifyStakes(r.big_blind_minor ?? 0);
        if (!stakes.has(tier)) return false;
      }
      return true;
    });
  }, [rows, gameType, stakes]);

  const toggleStake = (t: StakeTier) =>
    setStakes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <section className="space-y-6">
      {/* ---- filter bar ---- */}
      <div className={cn(GLASS_PANEL, "flex flex-wrap items-center gap-x-6 gap-y-3 p-4")}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Stakes
          </span>
          <div className="flex gap-2">
            {STAKE_TIERS.map((s) => {
              const active = stakes.has(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleStake(s.value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition",
                    active
                      ? "border-gold/60 bg-gold/15 text-gold"
                      : "border-white/12 bg-white/[0.02] text-neutral-300 hover:border-white/30",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Game Type
          </span>
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
            className="rounded-full border border-white/12 bg-black/40 px-4 py-1.5 text-xs font-semibold text-white outline-none transition focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
          >
            {GAME_TYPE_OPTIONS.map((g) => (
              <option key={g.value} value={g.value} className="bg-[#16191d]">
                {g.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="ml-auto text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition hover:text-foreground"
        >
          ← Back
        </button>
      </div>

      {/* ---- grid ---- */}
      {filtered.length === 0 ? (
        <div className={cn(GLASS_PANEL, "p-10 text-center text-sm text-neutral-400")}>
          No public games match these filters right now.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <BrowserCard key={r.match_id} row={r} busy={busy} onJoin={() => onJoin(r.match_id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function BrowserCard({
  row,
  busy,
  onJoin,
}: {
  row: PublicTableRow;
  busy: boolean;
  onJoin: () => void;
}) {
  const full = row.seated >= row.capacity;
  const blinds =
    row.big_blind_minor && row.small_blind_minor
      ? `${row.small_blind_minor / 100}/${row.big_blind_minor / 100}`
      : "—";

  return (
    <article className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex flex-col overflow-hidden p-4")}>
      {/* status + felt thumbnail */}
      <div className="relative">
        <FeltThumb />
        <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green backdrop-blur">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              full ? "bg-neutral-500" : "bg-green shadow-[0_0_8px_rgba(34,197,94,0.7)]",
            )}
          />
          {full ? "Full" : "Live"}
        </span>
        {row.demo && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
            Demo
          </span>
        )}
      </div>

      {/* facts */}
      <dl className="mt-3 space-y-1 text-sm">
        <Row k="Table Name" v={row.name} accent="foreground" />
        <Row k="Blind Levels" v={blinds} accent="green" />
        <Row k="Players" v={`${row.seated}/${row.capacity}`} accent="foreground" />
      </dl>

      <button
        type="button"
        disabled={busy || full || !!row.demo}
        onClick={onJoin}
        className={cn(
          BTN_GOLD,
          "mt-4 w-full rounded-xl py-2.5 text-sm uppercase tracking-wide",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {row.demo ? "Demo Table" : full ? "Table Full" : busy ? "Joining…" : "Join Table"}
      </button>
    </article>
  );
}

function Row({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent: "foreground" | "green";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[12px] text-neutral-400">{k}:</dt>
      <dd
        className={cn(
          "truncate text-right font-display text-sm font-bold",
          accent === "green" ? "text-green" : "text-foreground",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

// A compact felt-table thumbnail (NOT the live cinematic table) matching the
// browser card art: gunmetal rail, gold pinstripe, radial-lit felt.
function FeltThumb() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/[0.08]"
      style={{ background: "radial-gradient(120% 120% at 50% 0%, #101418, #05070a)" }}
    >
      <svg viewBox="0 0 320 150" className="h-full w-full" role="img" aria-label="Table">
        <defs>
          <radialGradient id="pgb-felt" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#1c7d4e" />
            <stop offset="60%" stopColor="#0f5f39" />
            <stop offset="100%" stopColor="#053821" />
          </radialGradient>
        </defs>
        <ellipse cx={160} cy={78} rx={132} ry={54} fill="#171b22" />
        <ellipse cx={160} cy={78} rx={126} ry={48} fill="none" stroke="#f5c518" strokeOpacity={0.5} strokeWidth={1.5} />
        <ellipse cx={160} cy={78} rx={118} ry={42} fill="url(#pgb-felt)" />
        <ellipse cx={160} cy={78} rx={92} ry={26} fill="none" stroke="#d4af37" strokeOpacity={0.3} strokeWidth={1} />
        <text
          x={160}
          y={82}
          textAnchor="middle"
          className="font-display"
          fontSize="12"
          fill="#f5c518"
          fillOpacity={0.65}
          letterSpacing="2"
        >
          ♦ HRC
        </text>
      </svg>
    </div>
  );
}

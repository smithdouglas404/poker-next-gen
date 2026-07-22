"use client";

import { useEffect, useMemo, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { blindLevels, leaderboardTop, tournamentStatus } from "./api";
import { DEMO_BLINDS, DEMO_LEADERBOARD, demoStatus } from "./demo";
import { blinds } from "./format";
import type { BlindLevel, EnrichedTournament, LeaderEntry, TournamentStatus } from "./types";

/** Podium tier styling — 1st gold+crown, 2nd silver, 3rd bronze. */
const PODIUM = {
  1: { ring: "#f5c518", glow: "rgba(245,197,24,0.45)", medal: "linear-gradient(135deg,#ffe27a,#f5c518)", label: "1" },
  2: { ring: "#c7ccd6", glow: "rgba(199,204,214,0.35)", medal: "linear-gradient(135deg,#e8ebf0,#a8b0bd)", label: "2" },
  3: { ring: "#cd7f4b", glow: "rgba(205,127,75,0.35)", medal: "linear-gradient(135deg,#e6a56a,#b26a38)", label: "3" },
} as const;

function initials(name: string): string {
  return (name || "?").slice(0, 2).toUpperCase();
}

function fullChips(n: number): string {
  return n.toLocaleString();
}

function currentBlind(levels: BlindLevel[], level: number): BlindLevel | undefined {
  const playable = levels.filter((l) => !l.is_break);
  if (playable.length === 0) return undefined;
  return playable[Math.min(Math.max(0, level - 1), playable.length - 1)] ?? playable[0];
}

function PodiumCard({ entry, place }: { entry: LeaderEntry; place: 1 | 2 | 3 }) {
  const p = PODIUM[place];
  const first = place === 1;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center rounded-2xl border px-4 pb-5 pt-9 text-center",
        first ? "border-gold/50 bg-gold/[0.06]" : "border-white/10 bg-white/[0.02]",
      )}
      style={first ? { boxShadow: `0 0 34px ${p.glow}` } : undefined}
    >
      {first && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl" aria-hidden>
          👑
        </span>
      )}
      <div
        className="relative flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold text-black"
        style={{ background: p.medal, boxShadow: `0 0 20px ${p.glow}` }}
      >
        {initials(entry.username)}
        <span
          className="absolute -bottom-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0b0d0f] text-[11px] font-bold text-black"
          style={{ background: p.medal }}
        >
          {p.label}
        </span>
      </div>
      <p className={cn("mt-4 font-display text-lg font-bold", first ? "text-gold" : "text-white")}>
        {entry.username || "Anon"}
      </p>
      <p className="mt-1 font-display text-sm font-bold tabular-nums text-green">
        {fullChips(entry.score)} <span className="text-[11px] font-medium text-neutral-500">Chips</span>
      </p>
      <p className="text-[11px] tabular-nums text-neutral-500">{entry.hands ?? entry.subscore ?? 0} Hands Played</p>
    </div>
  );
}

function TopStat({ label, value, tone }: { label: string; value: string; tone: "gold" | "white" | "green" }) {
  return (
    <div className="flex-1 px-5 py-1 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-bold tabular-nums",
          tone === "gold" ? "text-gold" : tone === "green" ? "text-green" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function Leaderboard({
  tournaments,
  selectedId,
  onSelect,
  registeredCounts,
  demo,
}: {
  tournaments: EnrichedTournament[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  registeredCounts: Record<string, number>;
  demo: boolean;
}) {
  const [status, setStatus] = useState<TournamentStatus | null>(null);
  const [levels, setLevels] = useState<BlindLevel[]>([]);
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const selected = tournaments.find((t) => t.id === selectedId) ?? tournaments[0] ?? null;
  const id = selected?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    if (demo) {
      const s = demoStatus(id);
      setStatus(s);
      setLevels(DEMO_BLINDS);
      setBoard(DEMO_LEADERBOARD);
      setLoading(false);
      return;
    }
    (async () => {
      const [statusRes, levelsRes, boardRes] = await Promise.allSettled([
        tournamentStatus(id),
        blindLevels(id),
        leaderboardTop("chips", 20),
      ]);
      if (cancelled) return;
      const s = statusRes.status === "fulfilled" ? statusRes.value : demoStatus(id);
      const standings = s.standings && s.standings.length > 0 ? s.standings : [];
      const live = boardRes.status === "fulfilled" ? boardRes.value : [];
      setStatus(s);
      setLevels(levelsRes.status === "fulfilled" && levelsRes.value.length > 0 ? levelsRes.value : DEMO_BLINDS);
      setBoard(standings.length > 0 ? standings : live.length > 0 ? live : DEMO_LEADERBOARD);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, demo]);

  const poolMinor = useMemo(() => {
    if (status?.prize_pool_minor) return status.prize_pool_minor;
    if (!selected) return 0;
    return (registeredCounts[selected.id] ?? status?.registered_count ?? 0) * selected.buy_in_minor;
  }, [status, selected, registeredCounts]);

  const remaining = status?.players_left ?? registeredCounts[selected?.id ?? ""] ?? 0;
  const field = selected?.max_players ?? status?.registered_count ?? remaining;
  const blindLvl = currentBlind(levels, status?.level ?? 1);

  const podium = board.slice(0, 3);
  const rest = board.slice(3);

  if (!selected) {
    return (
      <div className={cn(GLASS_PANEL, "p-8 text-center text-sm text-neutral-500")}>
        No tournaments to rank yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + event switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white">
          Tournament Leaderboard
        </h1>
        <select
          value={selected.id}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#16191d] px-4 py-2 text-sm font-semibold text-neutral-200 outline-none focus:border-brand/40"
        >
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Top stat bar */}
      <div
        className={cn(
          GLASS_PANEL,
          "flex flex-wrap items-stretch divide-white/10 border-gold/20 py-3 sm:divide-x",
        )}
      >
        <TopStat label="Current Prize Pool" value={`₮${fullChips(Math.round(poolMinor / 100))}`} tone="gold" />
        <TopStat label="Remaining Players" value={`${remaining} / ${field}`} tone="white" />
        <TopStat
          label="Blinds Level"
          value={
            blindLvl
              ? `${blinds(blindLvl.small_blind, blindLvl.big_blind)}${blindLvl.ante > 0 ? ` (Ante ${blindLvl.ante.toLocaleString()})` : ""}`
              : "—"
          }
          tone="green"
        />
      </div>

      <div className={cn(GLASS_PANEL, "p-5")}>
        {loading && <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Refreshing…</p>}

        {/* Podium */}
        {podium.length >= 3 ? (
          <div className="grid grid-cols-3 items-end gap-3 sm:gap-5">
            <div className="pt-6">
              <PodiumCard entry={podium[1]} place={2} />
            </div>
            <PodiumCard entry={podium[0]} place={1} />
            <div className="pt-6">
              <PodiumCard entry={podium[2]} place={3} />
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-500">
            Standings appear once the field is seated.
          </p>
        )}

        {/* Table */}
        {rest.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                  <th className="px-4 py-3 text-left font-semibold">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold">Avatar</th>
                  <th className="px-4 py-3 text-left font-semibold">Username</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Tournament Chips</th>
                  <th className="px-4 py-3 text-right font-semibold">Hands Played</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((e) => (
                  <tr
                    key={e.user_id || e.rank}
                    className="border-b border-white/5 transition last:border-b-0 hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3 font-display font-bold tabular-nums text-neutral-300">{e.rank}</td>
                    <td className="px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 text-[11px] font-bold text-white">
                        {initials(e.username)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{e.username || "Anon"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-green">{fullChips(e.score)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{e.hands ?? e.subscore ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {demo && (
        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-gold/60">
          Demo standings · offline
        </p>
      )}
    </div>
  );
}

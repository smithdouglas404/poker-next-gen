"use client";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { blinds, chips, clock } from "./format";
import { useNow } from "./useNow";
import type { BlindLevel, EnrichedTournament, LeaderEntry } from "./types";

/** Walk the blind structure from scheduled_at to find the live level. */
function liveLevel(levels: BlindLevel[], scheduledAt: string, now: number) {
  const playable = levels;
  if (playable.length === 0) return null;
  const start = Date.parse(scheduledAt);
  let elapsed = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  for (let i = 0; i < playable.length; i++) {
    const d = playable[i].duration_secs || 0;
    if (elapsed < d) return { index: i, remaining: d - elapsed };
    elapsed -= d;
  }
  return { index: playable.length - 1, remaining: 0 };
}

function LevelCell({ label, level }: { label: string; level: BlindLevel | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      {!level ? (
        <p className="mt-1 font-display text-sm font-bold text-neutral-600">—</p>
      ) : level.is_break ? (
        <p className="mt-1 font-display text-sm font-bold text-gold">Break</p>
      ) : (
        <>
          <p className="mt-1 font-display text-sm font-bold tabular-nums text-white">
            {blinds(level.small_blind, level.big_blind)}
          </p>
          {level.ante > 0 && (
            <p className="text-[10px] tabular-nums text-neutral-500">ante {level.ante.toLocaleString()}</p>
          )}
        </>
      )}
    </div>
  );
}

export function FocusRail({
  tournament,
  leaders,
  levels,
  live,
  demo,
}: {
  tournament: EnrichedTournament | null;
  leaders: LeaderEntry[];
  levels: BlindLevel[];
  live: boolean; // tournament is running
  demo: boolean;
}) {
  const now = useNow(1000);

  if (!tournament) {
    return (
      <div className={cn(GLASS_PANEL, "p-6 text-sm text-neutral-500")}>
        Select an event to see its live leaderboard and blind structure.
      </div>
    );
  }

  const cur = live ? liveLevel(levels, tournament.scheduled_at, now) : null;
  const curLevel = cur ? levels[cur.index] : levels[0];
  const nextLevel = cur ? levels[cur.index + 1] : levels[1];

  return (
    <div className={cn(GLASS_PANEL, "flex flex-col gap-5 p-5")}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Selected Focus</p>
        <h3 className="mt-1 font-display text-xl font-bold italic uppercase tracking-wide text-white">
          {tournament.name}
        </h3>
        {tournament.meta?.format && (
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            {tournament.meta.format}
            {tournament.meta.speed ? ` · ${tournament.meta.speed}` : ""}
          </p>
        )}
      </div>

      {/* Leaderboard */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Current Leaderboard
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]",
              live ? "text-green" : "text-neutral-600",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "animate-pulse bg-green" : "bg-neutral-600",
              )}
            />
            {live ? "Live" : "Pre-reg"}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {leaders.length === 0 && (
            <li className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-neutral-500">
              Standings appear once cards are in the air.
            </li>
          )}
          {leaders.slice(0, 5).map((e) => (
            <li
              key={e.user_id || e.rank}
              className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <span
                className={cn(
                  "w-6 font-display text-sm font-bold tabular-nums",
                  e.rank === 1 ? "text-gold" : e.rank <= 3 ? "text-neutral-200" : "text-neutral-500",
                )}
              >
                {String(e.rank).padStart(2, "0")}
              </span>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black"
                style={{
                  background:
                    e.rank === 1
                      ? "linear-gradient(135deg,#ffd54a,#f5c518)"
                      : "linear-gradient(135deg,#a8b0bd,#5b6270)",
                }}
              >
                {(e.username || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-white">
                {e.username || "Anon"}
              </span>
              <span className="font-display text-sm font-bold tabular-nums text-neutral-200">
                {chips(e.score)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Blind structure */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Blind Structure
          </p>
          {live && cur && (
            <span className="font-display text-xs font-bold tabular-nums text-foreground">
              in {clock(cur.remaining)}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <LevelCell label={live && cur ? `Current · Lv ${curLevel?.level ?? "?"}` : "Level 1"} level={curLevel} />
          <LevelCell label="Next Level" level={nextLevel} />
        </div>

        {/* Compact full ladder */}
        {levels.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-white/5">
            <table className="w-full text-xs">
              <tbody>
                {levels.map((lvl, i) => {
                  const isCur = live && cur?.index === i;
                  return (
                    <tr
                      key={lvl.id ?? `${lvl.level}-${i}`}
                      className={cn(
                        "border-t border-white/5 first:border-t-0",
                        isCur && "bg-brand/10",
                      )}
                    >
                      <td className="px-3 py-1.5 font-semibold text-neutral-400">
                        {lvl.is_break ? "Break" : `Lv ${lvl.level}`}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-200">
                        {lvl.is_break ? "—" : blinds(lvl.small_blind, lvl.big_blind)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                        {lvl.is_break ? "" : lvl.ante > 0 ? `+${lvl.ante.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                        {clock(lvl.duration_secs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {demo && (
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold/60">Demo structure · offline</p>
      )}
    </div>
  );
}

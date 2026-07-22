"use client";

import { useCallback, useEffect, useState } from "react";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { compact, money, profileApi, type LeaderboardEntry, type LeaderboardMetric } from "./profileRpc";

const METRICS: { id: LeaderboardMetric; label: string; fmt: (n: number) => string }[] = [
  { id: "winnings", label: "Winnings", fmt: (n) => money(n) },
  { id: "hands", label: "Hands", fmt: (n) => compact(n) },
  { id: "hrp", label: "HRP", fmt: (n) => compact(n) },
];

function rankStyle(rank: number): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-neutral-200";
  if (rank === 3) return "text-amber-600";
  return "text-neutral-500";
}

export function LeaderboardPanel({
  meUserId,
  notify,
}: {
  meUserId: string | null;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [metric, setMetric] = useState<LeaderboardMetric>("winnings");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (m: LeaderboardMetric) => {
      setLoading(true);
      try {
        const res = await profileApi.leaderboard(m, 25);
        setEntries(res.entries ?? []);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to load leaderboard", "err");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void load(metric);
  }, [metric, load]);

  const fmt = METRICS.find((m) => m.id === metric)?.fmt ?? ((n: number) => String(n));

  return (
    <section className={cn(GLASS_PANEL, "p-6")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={cn(HEADING_SM, "text-gold/80")}>Global Ladder</p>
          <h2 className="font-display mt-1 text-xl font-bold uppercase tracking-wide text-foreground">
            Leaderboard
          </h2>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                metric === m.id
                  ? "bg-brand/15 text-brand shadow-[0_0_16px_rgba(224,30,43,0.15)]"
                  : "text-neutral-400 hover:text-white",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        {loading && <p className="py-8 text-center text-sm text-neutral-500">Loading ladder…</p>}
        {!loading && entries.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-black/30 py-8 text-center text-sm text-neutral-400">
            The {metric} ladder is empty right now. Ranks populate as hands are played across the
            network.
          </p>
        )}
        {!loading &&
          entries.map((e) => {
            const isMe = meUserId !== null && e.user_id === meUserId;
            return (
              <div
                key={e.user_id}
                className={cn(
                  "flex items-center gap-4 rounded-xl border px-4 py-2.5 transition",
                  isMe
                    ? "border-brand/40 bg-brand/[0.06] shadow-[0_0_18px_rgba(224,30,43,0.1)]"
                    : "border-white/[0.06] bg-black/20 hover:border-white/15",
                )}
              >
                <span className={cn("w-8 font-display text-lg font-bold tabular-nums", rankStyle(e.rank))}>
                  {e.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {e.username || e.user_id.slice(0, 8)}
                    {isMe && <span className="ml-2 text-[10px] uppercase tracking-widest text-brand">You</span>}
                  </p>
                </div>
                <span className="font-display text-sm font-bold tabular-nums text-gold">{fmt(e.score)}</span>
              </div>
            );
          })}
      </div>
    </section>
  );
}

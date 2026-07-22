"use client";

import { useCallback, useEffect, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Donut, Sparkbars } from "../charts";
import { clubApi, compact, money, relTime } from "../clubRpc";
import { CardHeader, EmptyState, StatTile } from "../components";
import type { ClubStats, RakeLedger, RakeReport, RosterRow } from "../types";

const PERIODS = ["day", "week", "month", "quarter", "year", "all"];

export function Analytics({
  clubId,
  isConfigurer,
  toast,
}: {
  clubId: string;
  isConfigurer: boolean;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [period, setPeriod] = useState("month");
  const [report, setReport] = useState<RakeReport | null>(null);
  const [ledger, setLedger] = useState<RakeLedger | null>(null);
  const [members, setMembers] = useState<RosterRow[]>([]);
  const [clubStats, setClubStats] = useState<ClubStats | null>(null);
  const [rankings, setRankings] = useState<ClubStats[]>([]);

  const loadReport = useCallback(
    async (p: string) => {
      try {
        setReport(await clubApi.rakeReport(clubId, p));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Revenue data unavailable", "err");
        setReport(null);
      }
    },
    [clubId, toast],
  );

  const load = useCallback(async () => {
    const [led, ms, rk] = await Promise.allSettled([
      clubApi.rakeLedger(clubId),
      clubApi.memberStats(clubId),
      clubApi.rankings("chips_won"),
    ]);
    if (led.status === "fulfilled") setLedger(led.value);
    if (ms.status === "fulfilled") {
      setMembers(ms.value.members ?? []);
      setClubStats(ms.value.club_stats ?? null);
    }
    if (rk.status === "fulfilled") setRankings(rk.value.rankings ?? []);
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadReport(period);
  }, [loadReport, period]);

  if (!isConfigurer) {
    return (
      <div className={cn(GLASS_PANEL, "p-6 text-sm text-neutral-500")}>
        Club analytics and revenue are visible to owners and managers only.
      </div>
    );
  }

  const series = (report?.series ?? []).slice().reverse();
  const roleCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});
  const roleSegments = [
    { value: roleCounts.owner ?? 0, color: "#f5c518", label: "Owner" },
    { value: roleCounts.admin ?? 0, color: "#22c55e", label: "Admin" },
    { value: roleCounts.member ?? 0, color: "#e01e2b", label: "Member" },
  ].filter((s) => s.value > 0);

  const rank = clubStats
    ? rankings.findIndex((r) => r.club_id === clubStats.club_id) + 1
    : 0;

  return (
    <div className="space-y-5">
      {/* Revenue */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
            House Revenue
          </span>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                  p === period ? "bg-brand/15 text-brand" : "text-white/40 hover:text-white/70",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-3">
            <StatTile label={`Rake (${period})`} value={money(report?.total_rake ?? 0)} accent="#f5c518" />
            <StatTile label="Hands raked" value={compact(report?.hand_count ?? 0)} />
            <StatTile label="House balance" value={money(ledger?.house_balance ?? 0)} accent="#22c55e" />
          </div>
          <div className={cn(GLASS_PANEL, "flex flex-col justify-end p-4")}>
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-neutral-500">Daily rake</p>
            {series.length === 0 ? (
              <EmptyState>No rake recorded in this window.</EmptyState>
            ) : (
              <Sparkbars values={series.map((s) => s.amount)} color="#f5c518" />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Member composition */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Member Composition</CardHeader>
          {roleSegments.length === 0 ? (
            <EmptyState>No member data yet.</EmptyState>
          ) : (
            <div className="flex items-center gap-5">
              <Donut
                segments={roleSegments}
                center={
                  <>
                    <span className="font-display text-xl font-bold text-white">{members.length}</span>
                    <span className="text-[9px] uppercase tracking-wider text-neutral-500">members</span>
                  </>
                }
              />
              <div className="space-y-1.5">
                {roleSegments.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-white/70">{s.label}</span>
                    <span className="ml-auto font-semibold text-white">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {clubStats && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center">
              <div>
                <p className="font-display text-lg font-bold text-green">
                  {((clubStats.win_rate_bps ?? 0) / 100).toFixed(1)}%
                </p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Win rate</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white">{compact(clubStats.hands)}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Hands</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-gold">{clubStats.tourney_wins}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Tourney wins</p>
              </div>
            </div>
          )}
        </div>

        {/* Rankings */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader
            badge={rank > 0 && <span className="text-[11px] font-bold text-gold">#{rank}</span>}
          >
            Club Leaderboard
          </CardHeader>
          {rankings.length === 0 ? (
            <EmptyState>No ranked clubs yet.</EmptyState>
          ) : (
            <ol className="space-y-1.5">
              {rankings.slice(0, 8).map((r, i) => {
                const mine = clubStats && r.club_id === clubStats.club_id;
                return (
                  <li
                    key={r.club_id}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                      mine ? "border border-brand/30 bg-brand/[0.08]" : "bg-white/[0.02]",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-center font-bold text-white/40">{i + 1}</span>
                      <span className="truncate text-white/80">{r.club_id.slice(0, 12)}</span>
                    </span>
                    <span className="font-semibold text-gold">{compact(r.chips_won)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {/* Rake ledger */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <CardHeader>Recent Rake Ledger</CardHeader>
        {!ledger?.ledger || ledger.ledger.length === 0 ? (
          <EmptyState>No rake entries yet.</EmptyState>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                <tr>
                  <th className="pb-2 font-semibold">When</th>
                  <th className="pb-2 font-semibold">Hand</th>
                  <th className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.ledger.map((e) => (
                  <tr key={e.id} className="border-t border-white/[0.05]">
                    <td className="py-2 text-white/60">{relTime(e.created_at)}</td>
                    <td className="py-2 text-white/50">#{e.hand_no}</td>
                    <td className="py-2 text-right font-semibold text-gold">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

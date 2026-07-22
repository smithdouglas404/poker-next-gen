"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { KpiTile, Tag } from "./atoms";
import { bps, dollars } from "./format";
import type { EnrichedTournament, OwnerBucket, Prize, TournamentAnalytics } from "./types";

const BUCKET_STATUS: Record<OwnerBucket, (t: EnrichedTournament) => boolean> = {
  live: (t) => t.status === "running",
  upcoming: (t) => t.status === "registering",
  completed: (t) => t.status === "finished",
  drafts: (t) => t.status === "draft",
};

const BUCKETS: { id: OwnerBucket; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "drafts", label: "Drafts" },
];

function statusTone(status: string): "green" | "red" | "gold" | "purple" {
  if (status === "running") return "green";
  if (status === "registering") return "red";
  if (status === "finished") return "gold";
  return "purple";
}

interface AlertItem {
  tone: "red" | "gold" | "cyan" | "green";
  title: string;
  body: string;
}

function buildAlerts(
  tournaments: EnrichedTournament[],
  reg: (id: string) => number,
): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const t of tournaments) {
    const registered = reg(t.id);
    const poolMinor = registered * t.buy_in_minor;
    // Overlay risk: a guaranteed featured event under-subscribed vs its guarantee.
    if (t.status === "registering" && t.meta?.featured && registered < t.max_players * 0.5) {
      alerts.push({
        tone: "gold",
        title: `${t.name} — overlay risk`,
        body: `${registered}/${t.max_players} registered · pool ${dollars(poolMinor, { compact: true })}. Consider a guarantee top-up.`,
      });
    }
    // Late-reg closing soon on a running event.
    if (t.status === "running" && t.meta?.lateReg) {
      alerts.push({
        tone: "cyan",
        title: `${t.name} — late registration open`,
        body: `${registered} players remaining. Late reg closes at the next break.`,
      });
    }
  }
  if (alerts.length === 0) {
    alerts.push({ tone: "green", title: "All systems nominal", body: "No tournaments need attention right now." });
  }
  return alerts.slice(0, 4);
}

function PrizeLadder({ prizes, poolMinor }: { prizes: Prize[]; poolMinor: number }) {
  if (prizes.length === 0) {
    return <p className="text-sm text-neutral-500">No payout ladder defined.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {[...prizes]
        .sort((a, b) => a.rank_from - b.rank_from)
        .map((p, i) => {
          const share = (poolMinor * p.payout_bps) / 10000;
          const label = p.rank_from === p.rank_to ? `#${p.rank_from}` : `#${p.rank_from}–${p.rank_to}`;
          return (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 font-semibold">
                {p.rank_from === 1 && <span className="text-gold">🏆</span>}
                {label}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-neutral-500">{bps(p.payout_bps)}</span>
                <span className="font-display font-bold text-green">
                  {dollars(share, { compact: true })}
                </span>
              </span>
            </li>
          );
        })}
    </ul>
  );
}

export function OwnerCenter({
  tournaments,
  registeredCounts,
  loadAnalytics,
  onCreate,
  demo,
}: {
  tournaments: EnrichedTournament[];
  registeredCounts: Record<string, number>;
  loadAnalytics: (id: string) => Promise<TournamentAnalytics>;
  onCreate: () => void;
  demo: boolean;
}) {
  const [bucket, setBucket] = useState<OwnerBucket>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<TournamentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const reg = useCallback((id: string) => registeredCounts[id] ?? 0, [registeredCounts]);

  const rows = useMemo(
    () => tournaments.filter(BUCKET_STATUS[bucket]),
    [tournaments, bucket],
  );

  // Auto-select the first row in a bucket.
  useEffect(() => {
    if (rows.length > 0 && !rows.some((t) => t.id === selectedId)) {
      setSelectedId(rows[0].id);
    } else if (rows.length === 0) {
      setSelectedId(null);
      setAnalytics(null);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    loadAnalytics(selectedId)
      .then((a) => {
        if (!cancelled) setAnalytics(a);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadAnalytics]);

  // Portfolio KPIs across ALL tournaments.
  const liveCount = tournaments.filter((t) => t.status === "running").length;
  const totalRegistered = tournaments.reduce((s, t) => s + reg(t.id), 0);
  const totalPoolMinor = tournaments.reduce((s, t) => s + reg(t.id) * t.buy_in_minor, 0);
  const projectedRevenueMinor = tournaments.reduce((s, t) => s + reg(t.id) * (t.fee_minor ?? 0), 0);

  const alerts = useMemo(() => buildAlerts(tournaments, reg), [tournaments, reg]);
  const selected = tournaments.find((t) => t.id === selectedId) ?? null;
  const selectedPoolMinor = selected ? reg(selected.id) * selected.buy_in_minor : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
            Operator
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-tight text-white">
            Tournament Center
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Manage your live schedule, prize pools, and projected revenue across the network.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onCreate}>
          ♛ New Tournament
        </Button>
      </div>

      {/* Portfolio KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Live Now" value={liveCount} tone="green" hint="running events" />
        <KpiTile
          label="Total Prize Pool"
          value={dollars(totalPoolMinor, { compact: true })}
          tone="gold"
          hint="across all events"
        />
        <KpiTile label="Registered Players" value={totalRegistered.toLocaleString()} tone="cyan" hint="all events" />
        <KpiTile
          label="Projected Revenue"
          value={dollars(projectedRevenueMinor, { compact: true })}
          tone="green"
          hint="admin fees"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Schedule table */}
        <div className="min-w-0 space-y-4">
          <div className="flex rounded-xl border border-white/10 bg-black/30 p-1">
            {BUCKETS.map((b) => {
              const count = tournaments.filter(BUCKET_STATUS[b.id]).length;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBucket(b.id)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide transition",
                    bucket === b.id ? "bg-brand text-white" : "text-neutral-500 hover:text-neutral-300",
                  )}
                >
                  {b.label}
                  <span className="ml-1.5 text-[11px] text-neutral-600">{count}</span>
                </button>
              );
            })}
          </div>

          <div className={cn(GLASS_PANEL, "overflow-hidden")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                    <th className="px-4 py-3 text-left font-semibold">Tournament</th>
                    <th className="px-4 py-3 text-right font-semibold">Buy-in</th>
                    <th className="px-4 py-3 text-right font-semibold">Registered</th>
                    <th className="px-4 py-3 text-right font-semibold">Prize Pool</th>
                    <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                        No {bucket} tournaments.
                      </td>
                    </tr>
                  )}
                  {rows.map((t) => {
                    const registered = reg(t.id);
                    const pool = registered * t.buy_in_minor;
                    const revenue = registered * (t.fee_minor ?? 0);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          "cursor-pointer border-b border-white/5 transition last:border-b-0",
                          selectedId === t.id ? "bg-brand/[0.08]" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{t.name}</span>
                            <Tag tone={statusTone(t.status)}>{t.status}</Tag>
                          </div>
                          <p className="text-[11px] text-neutral-500">{t.meta?.format ?? t.variant}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                          {dollars(t.buy_in_minor, { compact: true })}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          {registered}
                          <span className="text-neutral-600">/{t.max_players}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-green">
                          {dollars(pool, { compact: true })}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold">
                          {dollars(revenue, { compact: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected analytics */}
          {selected && (
            <div className={cn(GLASS_PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Analytics
                  </p>
                  <h3 className="font-display text-lg font-bold text-white">{selected.name}</h3>
                </div>
                {loading && <span className="text-[11px] text-neutral-500">Loading…</span>}
              </div>

              {analytics && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Entrants" value={String(analytics.entrants ?? reg(selected.id))} />
                    <MiniStat label="Players Left" value={String(analytics.players_left ?? "—")} />
                    <MiniStat
                      label="Total Fees"
                      value={dollars(analytics.total_fees_minor ?? 0, { compact: true })}
                      tone="gold"
                    />
                    <MiniStat
                      label="Progress"
                      value={`${Math.round(analytics.progress_pct ?? 0)}%`}
                      tone="cyan"
                    />
                  </div>

                  {/* progress bar */}
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0a7d43] to-[#22c55e] transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, analytics.progress_pct ?? 0))}%` }}
                    />
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                        Payout Ladder
                      </p>
                      <PrizeLadder prizes={analytics.prizes ?? []} poolMinor={analytics.prize_pool_minor ?? selectedPoolMinor} />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                        Finishers
                      </p>
                      {(analytics.finishers?.length ?? 0) === 0 ? (
                        <p className="text-sm text-neutral-500">
                          No finishers yet — results post as players bust.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {analytics.finishers!.map((f, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-white">{f.username ?? "Anon"}</span>
                              <span className="font-display font-bold text-neutral-400">
                                #{f.finish_place ?? "?"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Alerts rail */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
              <span className="text-gold">⚠</span> Alerts
            </p>
            <ul className="mt-3 space-y-2.5">
              {alerts.map((a, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-xl border px-3.5 py-3",
                    a.tone === "gold"
                      ? "border-gold/30 bg-gold/[0.06]"
                      : a.tone === "red"
                        ? "border-brand/35 bg-brand/[0.07]"
                        : a.tone === "green"
                          ? "border-green/30 bg-green/[0.06]"
                          : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-bold uppercase tracking-wide",
                      a.tone === "gold"
                        ? "text-gold"
                        : a.tone === "red"
                          ? "text-[#ff2d3f]"
                          : a.tone === "green"
                            ? "text-green"
                            : "text-neutral-300",
                    )}
                  >
                    {a.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-neutral-400">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>

          {demo && (
            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-gold/60">
              Demo portfolio · offline
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "cyan" | "gold";
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-bold tabular-nums",
          tone === "cyan" ? "text-green" : tone === "gold" ? "text-gold" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

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

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
function ordinal(n: number): string {
  return ORDINAL[n] ?? `${n}th`;
}

/** Payout table with percentage + chip value + paid state, mirroring the
 *  analytics master (1st tier highlighted, checkmarks once a tier is settled). */
function PayoutTable({
  prizes,
  poolMinor,
  paidFromRank,
}: {
  prizes: Prize[];
  poolMinor: number;
  paidFromRank: number; // ranks at or below the field but >= this are settled
}) {
  if (prizes.length === 0) {
    return <p className="text-sm text-neutral-500">No payout ladder defined.</p>;
  }
  const sorted = [...prizes].sort((a, b) => a.rank_from - b.rank_from);
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
        <span>Rank</span>
        <span className="text-right">%</span>
        <span className="text-right">Chip Value</span>
        <span className="text-right">Paid</span>
      </div>
      <ul className="space-y-1">
        {sorted.map((p, i) => {
          const share = (poolMinor * p.payout_bps) / 10000;
          const label = p.rank_from === p.rank_to ? ordinal(p.rank_from) : `${ordinal(p.rank_from)}–${ordinal(p.rank_to)}`;
          const paid = p.rank_from >= paidFromRank;
          const first = p.rank_from === 1;
          return (
            <li
              key={i}
              className={cn(
                "grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 rounded-lg border px-3 text-sm",
                first
                  ? "border-gold/45 bg-gold/[0.07] py-2.5 shadow-[0_0_18px_rgba(245,197,24,0.12)]"
                  : "border-white/5 bg-white/[0.02] py-2",
              )}
            >
              <span className={cn("flex items-center gap-2 font-semibold", first ? "text-gold" : "text-white")}>
                {first && <span aria-hidden>👑</span>}
                {label}
              </span>
              <span className={cn("text-right tabular-nums", first ? "text-gold" : "text-neutral-400")}>
                {bps(p.payout_bps)}
              </span>
              <span className={cn("text-right font-display font-bold tabular-nums", first ? "text-gold" : "text-green")}>
                {dollars(share, { compact: true })}
              </span>
              <span className="text-right text-green">{paid ? "✓" : <span className="text-neutral-700">—</span>}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Donut chart of payout distribution (top tiers by basis points). */
function PayoutDonut({ prizes }: { prizes: Prize[] }) {
  const sorted = [...prizes].sort((a, b) => a.rank_from - b.rank_from).slice(0, 6);
  const total = sorted.reduce((s, p) => s + p.payout_bps, 0) || 1;
  const palette = ["#f5c518", "#e0b528", "#22c55e", "#15803d", "#2a9d8f", "#d4af37"];
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 110 110" className="h-40 w-40 -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#1f232a" strokeWidth="16" />
        {sorted.map((p, i) => {
          const frac = p.payout_bps / total;
          const len = frac * c;
          const seg = (
            <circle
              key={i}
              cx="55"
              cy="55"
              r={r}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="mt-3 grid w-full grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {sorted.map((p, i) => (
          <span key={i} className="flex items-center gap-1.5 text-neutral-400">
            <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
            {ordinal(p.rank_from)}
            <span className="ml-auto tabular-nums text-neutral-300">{bps(p.payout_bps)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FinancialCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-white">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-600">chips</p>
    </div>
  );
}

/** Local operator chat / activity feed (matches the center master's chat rail).
 *  Not backed by an RPC — messages stay client-side this session. */
function ChatPanel() {
  const [msgs, setMsgs] = useState<{ who: string; body: string; mine?: boolean }[]>([
    { who: "AceKing", body: "Overlay covered on Stake Freeout — nice." },
    { who: "System", body: 'Tournament "Stake Freeout" registration open.' },
    { who: "Wansyl", body: "Final table in ~10 mins, railbirds welcome." },
  ]);
  const [draft, setDraft] = useState("");
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setMsgs((m) => [...m, { who: "You", body, mine: true }]);
    setDraft("");
  };
  return (
    <div className={cn(GLASS_PANEL, "flex flex-col p-4")}>
      <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
        <span className="text-brand">💬</span> Global Club Chat
      </p>
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {msgs.map((m, i) => (
          <li key={i} className="text-[12px] leading-snug">
            <span
              className={cn(
                "font-bold",
                m.mine ? "text-green" : m.who === "System" ? "text-gold" : "text-brand",
              )}
            >
              {m.who}:{" "}
            </span>
            <span className="text-neutral-300">{m.body}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-brand/40"
        />
        <button
          type="button"
          onClick={send}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand/80"
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

export function OwnerCenter({
  tournaments,
  registeredCounts,
  loadAnalytics,
  onCreate,
  onFinalize,
  demo,
}: {
  tournaments: EnrichedTournament[];
  registeredCounts: Record<string, number>;
  loadAnalytics: (id: string) => Promise<TournamentAnalytics>;
  onCreate: () => void;
  onFinalize: (id: string) => Promise<void>;
  demo: boolean;
}) {
  const [bucket, setBucket] = useState<OwnerBucket>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<TournamentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

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

                  {(() => {
                    const poolMinor = analytics.prize_pool_minor ?? selectedPoolMinor;
                    const buyInsMinor = (analytics.entrants ?? reg(selected.id)) * (analytics.buy_in_minor ?? selected.buy_in_minor);
                    const rebuysMinor = analytics.rebuys_minor ?? 0;
                    const rakeMinor = analytics.rake_minor ?? analytics.total_fees_minor ?? 0;
                    const netPoolMinor = poolMinor || Math.max(0, buyInsMinor + rebuysMinor - rakeMinor);
                    const finished = selected.status === "finished";
                    const paidFromRank = finished ? 1 : (analytics.players_left ?? 0) + 1;
                    return (
                      <>
                        {/* Financial Overview */}
                        <div className="mt-5 rounded-xl border border-gold/20 bg-black/20 py-3">
                          <p className="mb-2 text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-gold">
                            Financial Overview
                          </p>
                          <div className="grid grid-cols-2 divide-white/10 sm:grid-cols-4 sm:divide-x">
                            <FinancialCell label="Total Buy-ins" value={compactChips(buyInsMinor)} />
                            <FinancialCell label="Re-buys / Add-ons" value={compactChips(rebuysMinor)} />
                            <FinancialCell label="Club Rake" value={compactChips(rakeMinor)} />
                            <FinancialCell label="Net Prize Pool" value={compactChips(netPoolMinor)} />
                          </div>
                        </div>

                        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_240px]">
                          {/* Payout table */}
                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                              Payout Table
                            </p>
                            <PayoutTable
                              prizes={analytics.prizes ?? []}
                              poolMinor={netPoolMinor}
                              paidFromRank={paidFromRank}
                            />
                          </div>
                          {/* Distribution + summary */}
                          <div className="space-y-5">
                            <div>
                              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                                Payout Distribution
                              </p>
                              {(analytics.prizes?.length ?? 0) > 0 ? (
                                <PayoutDonut prizes={analytics.prizes ?? []} />
                              ) : (
                                <p className="text-center text-xs text-neutral-500">No ladder yet.</p>
                              )}
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gold">
                                Tournament Summary
                              </p>
                              <dl className="mt-3 space-y-2 text-sm">
                                <SummaryLine label="Start Date" value={fmtDate(selected.scheduled_at)} />
                                <SummaryLine
                                  label="Total Hands"
                                  value={(analytics.hands_played ?? 0).toLocaleString()}
                                />
                                <SummaryLine
                                  label="Avg Stack"
                                  value={`${(analytics.avg_stack ?? selected.starting_stack).toLocaleString()} chips`}
                                />
                                <SummaryLine label="Players Left" value={String(analytics.players_left ?? "—")} />
                              </dl>
                            </div>
                          </div>
                        </div>

                        {/* Finishers */}
                        {(analytics.finishers?.length ?? 0) > 0 && (
                          <div className="mt-5">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                              Finishers
                            </p>
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
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                          <Button variant="outline" size="lg" onClick={() => exportReport(analytics, selected)}>
                            Export Report
                          </Button>
                          <Button
                            variant="primary"
                            size="lg"
                            disabled={finalizing || finished}
                            onClick={async () => {
                              setFinalizing(true);
                              try {
                                await onFinalize(selected.id);
                              } finally {
                                setFinalizing(false);
                              }
                            }}
                          >
                            {finished ? "Finalized ✓" : finalizing ? "Finalizing…" : "♛ Finalize Tournament"}
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {/* Alerts rail */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
              <span className="text-gold">⚠</span> Tournament Alerts
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

          <ChatPanel />

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

/** Chips shown big & compact: minor units → whole-chip compact figure. */
function compactChips(minor: number): string {
  const v = Math.round(minor / 100);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  return v.toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

/** Export the analytics snapshot as a downloaded JSON report (client-side). */
function exportReport(a: TournamentAnalytics, t: EnrichedTournament) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify({ ...a, name: t.name }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${t.name.replace(/\s+/g, "_").toLowerCase()}_report.json`;
  link.click();
  URL.revokeObjectURL(url);
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

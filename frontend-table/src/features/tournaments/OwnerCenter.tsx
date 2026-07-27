"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { tournamentBalance } from "./api";
import { KpiTile, Tag } from "./atoms";
import { dollars } from "./format";
import { PayoutSettlement } from "./PayoutSettlement";
import type { EnrichedTournament, OwnerBucket, TournamentAnalytics } from "./types";

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
  tone: "red" | "gold" | "steel" | "green";
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
        tone: "steel",
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


/** Operator club chat rail, wired to the real club_chat_send / club_chat_list
 *  RPCs against the operator's club (resolved from me_roles). Falls back to a
 *  clearly-labelled local thread only when the caller operates no club / offline. */
function ChatPanel() {
  const [msgs, setMsgs] = useState<{ who: string; body: string; mine?: boolean }[]>([]);
  const [draft, setDraft] = useState("");
  const [clubId, setClubId] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // Resolve the operator's club, then poll its chat.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      let id: string | null = null;
      try {
        const roles = (await callSessionRpc("me_roles", {})) as { club_admin_of?: string[] };
        id = roles?.club_admin_of?.[0] ?? null;
        if (!id) {
          const list = (await callSessionRpc("club_list", {})) as { clubs?: Array<{ id: string }> };
          id = list?.clubs?.[0]?.id ?? null;
        }
      } catch {
        /* offline / guest */
      }
      if (cancelled) return;
      setClubId(id);
      if (!id) {
        setMsgs([{ who: "System", body: "Operate a club to use Global Club Chat." }]);
        return;
      }
      const refresh = async () => {
        try {
          const r = (await callSessionRpc("club_chat_list", { club_id: id, limit: 40 })) as {
            messages?: Array<{ username?: string; text?: string; user_id?: string }>;
          };
          if (cancelled) return;
          setLive(true);
          setMsgs(
            (r.messages ?? []).map((m) => ({ who: m.username || "Member", body: m.text || "" })),
          );
        } catch {
          /* transient */
        }
      };
      await refresh();
      timer = setInterval(refresh, 5000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    if (clubId && live) {
      setMsgs((m) => [...m, { who: "You", body, mine: true }]);
      void callSessionRpc("club_chat_send", { club_id: clubId, text: body }).catch(() => {});
    } else {
      setMsgs((m) => [...m, { who: "You", body, mine: true }]);
    }
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
  onStart,
  onSetBalancingRule,
  demo,
}: {
  tournaments: EnrichedTournament[];
  registeredCounts: Record<string, number>;
  loadAnalytics: (id: string) => Promise<TournamentAnalytics>;
  onCreate: () => void;
  onFinalize: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onSetBalancingRule: (
    id: string,
    maxSeatDifference: number,
    breakTableAtOrBelow: number,
    strategy: "balanced" | "random",
  ) => Promise<void>;
  demo: boolean;
}) {
  const [bucket, setBucket] = useState<OwnerBucket>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<TournamentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumped to force an analytics refetch — settlement changes the snapshot, so
  // finalizing has to re-read rather than keep showing the pre-settlement view.
  const [analyticsNonce, setAnalyticsNonce] = useState(0);
  const [starting, setStarting] = useState(false);
  // Balancing-rule config (balancing_rule_set).
  const [seatDiff, setSeatDiff] = useState(1);
  const [breakAt, setBreakAt] = useState(2);
  const [strategy, setStrategy] = useState<"balanced" | "random">("balanced");
  const [ruleMsg, setRuleMsg] = useState<string | null>(null);
  const [balancing, setBalancing] = useState(false);
  const [balanceMsg, setBalanceMsg] = useState<string | null>(null);

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
  }, [selectedId, loadAnalytics, analyticsNonce]);

  // Portfolio KPIs across ALL tournaments.
  const liveCount = tournaments.filter((t) => t.status === "running").length;
  const totalRegistered = tournaments.reduce((s, t) => s + reg(t.id), 0);
  const totalPoolMinor = tournaments.reduce((s, t) => s + reg(t.id) * t.buy_in_minor, 0);
  const projectedRevenueMinor = tournaments.reduce((s, t) => s + reg(t.id) * (t.fee_minor ?? 0), 0);

  const alerts = useMemo(() => buildAlerts(tournaments, reg), [tournaments, reg]);
  const selected = tournaments.find((t) => t.id === selectedId) ?? null;

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

          {/* Selected tournament — settlement + operator controls */}
          {selected && (
            <div className={cn(GLASS_PANEL, "p-5")}>
              {/* The payout / finalize surface (HRC `dpts_17`). It owns the
                  financial overview, payout ladder, distribution, progress,
                  summary, Export and Finalize — this panel keeps only the
                  operator controls that are not part of settlement. */}
              <PayoutSettlement
                tournament={selected}
                analytics={analytics}
                loading={loading}
                disabled={demo}
                onFinalize={onFinalize}
                onReload={() => setAnalyticsNonce((n) => n + 1)}
              />

              {/* Finishers */}
              {(analytics?.finishers?.length ?? 0) > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      Finishers
                    </p>
                    <ul className="space-y-1.5">
                      {analytics!.finishers!.map((f, i) => (
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

                {/* Operator controls. Settlement (Export / Finalize) lives
                    in PayoutSettlement above; these are the run-time
                    director actions. */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={balancing || demo || selected.status !== "running"}
                    title={
                      selected.status === "running"
                        ? "Rebalance and merge tables now"
                        : "Available while the tournament is running"
                    }
                    onClick={async () => {
                      setBalancing(true);
                      setBalanceMsg(null);
                      try {
                        await tournamentBalance(selected.id);
                        setBalanceMsg("Balancing requested — the director is rebalancing tables.");
                      } catch (e) {
                        setBalanceMsg(e instanceof Error ? e.message : "Balance failed.");
                      } finally {
                        setBalancing(false);
                      }
                    }}
                  >
                    {balancing ? "Balancing…" : "⚖ Balance / Merge Tables"}
                  </Button>
                  {selected.status === "registering" && (
                    <Button
                      variant="primary"
                      size="lg"
                      disabled={starting || demo}
                      title="Seat entrants and launch the tables (needs ≥1 blind level and prizes summing to 100%)."
                      onClick={async () => {
                        setStarting(true);
                        try {
                          await onStart(selected.id);
                        } finally {
                          setStarting(false);
                        }
                      }}
                    >
                      {starting ? "Starting…" : "▶ Start Tournament"}
                    </Button>
                  )}
                  {balanceMsg && (
                    <p className="text-xs text-neutral-400 sm:col-span-2">{balanceMsg}</p>
                  )}
                </div>

                {/* Multi-table balancing rule (balancing_rule_set) */}
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Table Balancing Rule
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-neutral-500">Max seat gap</span>
                      <input type="number" min={1} max={9} value={seatDiff}
                        onChange={(e) => setSeatDiff(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-neutral-500">Break table at/below</span>
                      <input type="number" min={1} max={9} value={breakAt}
                        onChange={(e) => setBreakAt(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-neutral-500">Strategy</span>
                      <select value={strategy} onChange={(e) => setStrategy(e.target.value as "balanced" | "random")}
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none">
                        <option value="balanced">balanced</option>
                        <option value="random">random</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={demo}
                    onClick={async () => {
                      setRuleMsg(null);
                      try {
                        await onSetBalancingRule(selected.id, seatDiff, breakAt, strategy);
                        setRuleMsg("Balancing rule saved.");
                      } catch (e) {
                        setRuleMsg(e instanceof Error ? e.message : "Save failed.");
                      }
                    }}
                    className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gold transition hover:bg-gold/15 disabled:opacity-40"
                  >
                    Save balancing rule
                  </button>
                  {ruleMsg && <p className="mt-2 text-[11px] text-neutral-400">{ruleMsg}</p>}
                </div>
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

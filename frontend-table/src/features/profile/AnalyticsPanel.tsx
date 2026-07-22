"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";

import { NetTile, RadialGauge, StatMeter } from "./charts";
import {
  profileApi,
  type HeadToHead,
  type Leak,
  type LeakReport,
  type LeakSeverity,
  type PlayerStats,
} from "./profileRpc";

const SEVERITY: Record<LeakSeverity, { text: string; border: string; dot: string; label: string }> = {
  info: { text: "text-sky-300", border: "border-sky-500/30", dot: "bg-sky-400", label: "Info" },
  warn: { text: "text-amber-300", border: "border-amber-500/30", dot: "bg-amber-400", label: "Warning" },
  high: { text: "text-red-300", border: "border-red-500/40", dot: "bg-red-400", label: "Critical" },
};

function LeakCard({ leak }: { leak: Leak }) {
  const s = SEVERITY[leak.severity] ?? SEVERITY.info;
  return (
    <div className={cn("rounded-xl border bg-black/30 p-4", s.border)}>
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", s.dot)} />
        <span className={cn("font-display text-sm font-bold uppercase tracking-wide", s.text)}>{leak.title}</span>
        <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-neutral-500">{s.label}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-300">{leak.detail}</p>
      <p className="mt-2 text-xs text-cyan/80">→ {leak.suggestion}</p>
    </div>
  );
}

export function AnalyticsPanel({
  notify,
}: {
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [report, setReport] = useState<LeakReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [opponent, setOpponent] = useState("");
  const [h2h, setH2h] = useState<HeadToHead | null>(null);
  const [h2hBusy, setH2hBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([profileApi.stats(), profileApi.leakReport()]);
      setStats(s);
      setReport(r);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load analytics", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const runHeadToHead = useCallback(async () => {
    const id = opponent.trim();
    if (id === "") return;
    setH2hBusy(true);
    try {
      setH2h(await profileApi.headToHead(id));
    } catch (e) {
      setH2h(null);
      notify(e instanceof Error ? e.message : "Head-to-head lookup failed", "err");
    } finally {
      setH2hBusy(false);
    }
  }, [opponent, notify]);

  return (
    <div className="space-y-6">
      {/* Core stats */}
      <section className={cn(GLASS_PANEL, "p-6")}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>Player Analytics</p>
            <h2 className="font-display mt-1 text-xl font-bold uppercase tracking-wide text-foreground">
              Game Profile
            </h2>
          </div>
          <span className="text-xs text-neutral-500">
            {loading ? "Loading…" : `${stats?.hands ?? 0} tracked hands`}
          </span>
        </div>

        {stats && stats.hands === 0 && !loading && (
          <p className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-400">
            No tracked hands yet. Play a hand at the table and your VPIP, PFR, aggression, and net
            results will populate here automatically.
          </p>
        )}

        {stats && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <RadialGauge label="VPIP" value={stats.vpip_pct} ideal={[18, 28]} accent="#81ecff" />
              <RadialGauge label="PFR" value={stats.pfr_pct} ideal={[14, 22]} accent="#22d3ee" />
              <RadialGauge label="WTSD" value={stats.wtsd_pct} ideal={[24, 30]} accent="#b44dff" />
              <RadialGauge label="AF" value={stats.af} max={6} ideal={[2, 3.5]} accent="#e9c46a" suffix="" />
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <StatMeter label="Win rate" value={stats.win_rate_pct} accent="#34d399" ideal={50} />
              <StatMeter label="Won at showdown" value={stats.wsd_pct} accent="#81ecff" ideal={52} />
              <div className={cn(GLASS_PANEL, "flex items-center justify-between px-4 py-3")}>
                <NetTile label="Net result" value={stats.net} cents={stats.net_cents} />
              </div>
            </div>
            <p className="mt-4 text-[11px] text-neutral-500">
              Gold band = healthy range for 6-max cash. Ranges are guidance, not targets.
            </p>
          </>
        )}
      </section>

      {/* Leak report */}
      <section className={cn(GLASS_PANEL, "p-6")}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>Leak Report</p>
            <h2 className="font-display mt-1 text-xl font-bold uppercase tracking-wide text-foreground">
              Coaching Signals
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {report && report.leaks.length > 0 ? (
            report.leaks.map((leak) => <LeakCard key={leak.code} leak={leak} />)
          ) : (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 text-sm text-emerald-200 md:col-span-2">
              {loading
                ? "Analyzing your play…"
                : "No leaks detected. Keep playing — the report sharpens as your sample grows."}
            </p>
          )}
        </div>
      </section>

      {/* Head-to-head */}
      <section className={cn(GLASS_PANEL, "p-6")}>
        <p className={cn(HEADING_SM, "text-gold/80")}>Head-to-Head</p>
        <h2 className="font-display mt-1 text-xl font-bold uppercase tracking-wide text-foreground">
          Rivalry Record
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Opponent user ID" className="flex-1">
            <Input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. 8f2a…-uuid"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runHeadToHead();
              }}
            />
          </Field>
          <Button onClick={() => void runHeadToHead()} disabled={h2hBusy || opponent.trim() === ""}>
            {h2hBusy ? "Looking up…" : "Compare"}
          </Button>
        </div>

        {h2h && (
          <div className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "mt-5 p-5")}>
            <div className="grid grid-cols-3 items-center gap-2 text-center">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan/80">You</p>
                <p className="font-display text-3xl font-bold text-foreground">{h2h.my_wins}</p>
              </div>
              <div className="text-neutral-500">
                <p className="text-[11px] uppercase tracking-[0.2em]">{h2h.hands} hands</p>
                <p className="font-display text-lg">vs</p>
                <p className="text-[11px] text-neutral-600">{h2h.showdowns} showdowns</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Rival</p>
                <p className="font-display text-3xl font-bold text-foreground">{h2h.opp_wins}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={cn(GLASS_PANEL, "px-4 py-3")}>
                <NetTile label="Your net vs rival" value={h2h.my_net} cents={h2h.my_net_cents} />
              </div>
              <div className={cn(GLASS_PANEL, "px-4 py-3")}>
                <NetTile label="Rival net vs you" value={h2h.opp_net} cents={h2h.opp_net_cents} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

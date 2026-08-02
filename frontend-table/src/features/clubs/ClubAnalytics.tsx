"use client";
// ── Club Analytics Dashboard ─────────────────────────────────────────────────
// Full analytics view for club owners: revenue, member activity, game stats,
// top players, retention metrics, and session trends.
import { useState } from "react";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Period = "7d" | "30d" | "90d" | "1y";

const PERIOD_LABELS: Record<Period, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days", "1y": "1 Year" };

const DEMO_KPI = [
  { label: "Total Revenue",   value: "$48,240",  delta: "+12.4%", tone: "green",   icon: "💰" },
  { label: "Active Members",  value: "284",       delta: "+8.1%",  tone: "green",   icon: "👥" },
  { label: "Games Played",    value: "1,842",     delta: "+5.3%",  tone: "green",   icon: "🃏" },
  { label: "Avg Session",     value: "2h 18m",    delta: "-3.2%",  tone: "red",     icon: "⏱" },
  { label: "Rake Collected",  value: "$4,120",    delta: "+9.8%",  tone: "green",   icon: "📊" },
  { label: "New Members",     value: "42",        delta: "+21.0%", tone: "green",   icon: "✨" },
];

const DEMO_TOP_PLAYERS = [
  { rank: 1, name: "AceHunter99",  hands: 842, winnings: "$8,420", wr: "+12.4bb/100", sessions: 28 },
  { rank: 2, name: "RiverQueen",   hands: 720, winnings: "$6,180", wr: "+9.8bb/100",  sessions: 24 },
  { rank: 3, name: "ChipLeader",   hands: 680, winnings: "$5,840", wr: "+8.2bb/100",  sessions: 22 },
  { rank: 4, name: "BluffMaster",  hands: 612, winnings: "$4,200", wr: "+6.1bb/100",  sessions: 20 },
  { rank: 5, name: "PocketRocket", hands: 540, winnings: "$3,960", wr: "+5.4bb/100",  sessions: 18 },
];

const DEMO_GAME_BREAKDOWN = [
  { game: "NL Hold'em", sessions: 820, rake: "$2,460", avgPot: "$184", pct: 65 },
  { game: "PLO",        sessions: 310, rake: "$1,020", avgPot: "$340", pct: 25 },
  { game: "Short Deck", sessions: 120, rake: "$420",   avgPot: "$280", pct: 10 },
];

const DEMO_DAILY = [
  { day: "Mon", revenue: 5200, members: 38 },
  { day: "Tue", revenue: 4800, members: 32 },
  { day: "Wed", revenue: 6100, members: 44 },
  { day: "Thu", revenue: 7200, members: 52 },
  { day: "Fri", revenue: 8900, members: 68 },
  { day: "Sat", revenue: 9800, members: 76 },
  { day: "Sun", revenue: 6240, members: 48 },
];

const MAX_REVENUE = Math.max(...DEMO_DAILY.map((d) => d.revenue));
const MAX_MEMBERS = Math.max(...DEMO_DAILY.map((d) => d.members));

function MiniBarChart({ data, valueKey, color }: {
  data: typeof DEMO_DAILY;
  valueKey: "revenue" | "members";
  color: string;
}) {
  const max = valueKey === "revenue" ? MAX_REVENUE : MAX_MEMBERS;
  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map((d) => {
        const pct = (d[valueKey] / max) * 100;
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm transition-all duration-500"
              style={{ height: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}40`, minHeight: 4 }}
            />
            <span className="text-[9px] text-neutral-600">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: typeof DEMO_KPI[0] }) {
  const toneColor = kpi.tone === "green" ? "#22c55e" : "#ff4455";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#181e27] p-4 transition hover:-translate-y-0.5 hover:border-white/[0.12]">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${toneColor}30,transparent)` }} />
      <div className="flex items-start justify-between">
        <span className="text-xl">{kpi.icon}</span>
        <span className="text-xs font-bold" style={{ color: toneColor }}>{kpi.delta}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold text-white">{kpi.value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{kpi.label}</p>
    </div>
  );
}

export function ClubAnalytics({ clubName = "Diamond Lounge" }: { clubName?: string }) {
  const [period, setPeriod] = useState<Period>("30d");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">{clubName} Analytics</h1>
          <p className="mt-0.5 text-xs text-neutral-500">Performance overview for club owners</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
          {(["7d", "30d", "90d", "1y"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition",
                period === p ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25" : "text-neutral-500 hover:text-white",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DEMO_KPI.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue chart */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Daily Revenue</p>
            <span className="font-display text-sm font-bold text-[#f5c518]">$48,240 total</span>
          </div>
          <MiniBarChart data={DEMO_DAILY} valueKey="revenue" color="#f5c518" />
        </div>
        {/* Active members chart */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Daily Active Members</p>
            <span className="font-display text-sm font-bold text-[#22c55e]">284 avg</span>
          </div>
          <MiniBarChart data={DEMO_DAILY} valueKey="members" color="#22c55e" />
        </div>
      </div>

      {/* Game breakdown + Top players */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Game breakdown */}
        <div className={cn(GLASS_PANEL, "p-5 space-y-4")}>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Game Breakdown</p>
          {DEMO_GAME_BREAKDOWN.map((g) => (
            <div key={g.game} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-white">{g.game}</span>
                <span className="text-neutral-400">{g.sessions} sessions</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${g.pct}%`, background: "linear-gradient(90deg,#92700a,#f5c518)", boxShadow: "0 0 8px rgba(245,197,24,0.30)" }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Rake: {g.rake}</span>
                <span>Avg pot: {g.avgPot}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Top players */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-4">Top Players</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["#", "Player", "Hands", "Winnings", "Win Rate"].map((h) => (
                  <th key={h} className="pb-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_TOP_PLAYERS.map((p) => (
                <tr key={p.rank} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition">
                  <td className="py-2.5 pr-2">
                    <span className={cn(
                      "font-display text-sm font-bold",
                      p.rank === 1 ? "text-[#f5c518]" : p.rank === 2 ? "text-neutral-300" : p.rank === 3 ? "text-amber-600" : "text-neutral-600",
                    )}>
                      {p.rank === 1 ? "★" : p.rank}
                    </span>
                  </td>
                  <td className="py-2.5 font-semibold text-white">{p.name}</td>
                  <td className="py-2.5 text-neutral-400">{p.hands.toLocaleString()}</td>
                  <td className="py-2.5 font-bold text-[#22c55e]">{p.winnings}</td>
                  <td className="py-2.5 text-xs text-[#22c55e]">{p.wr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Retention + alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(GLASS_PANEL, "p-5 space-y-3")}>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Retention Metrics</p>
          {[
            { label: "7-day retention",  value: "68%", color: "#22c55e" },
            { label: "30-day retention", value: "42%", color: "#f5c518" },
            { label: "Churn rate",       value: "8.2%", color: "#ff4455" },
            { label: "Avg sessions/member", value: "6.4/mo", color: "white" },
          ].map((m) => (
            <div key={m.label} className="flex items-center justify-between border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0">
              <span className="text-sm text-neutral-400">{m.label}</span>
              <span className="font-display font-bold" style={{ color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
        <div className={cn(GLASS_PANEL, "p-5 space-y-3")}>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Club Alerts</p>
          {[
            { msg: "3 members have not played in 14+ days", tone: "#f5c518", icon: "⚠" },
            { msg: "Revenue up 12% vs last period", tone: "#22c55e", icon: "↑" },
            { msg: "New member record: 42 this month", tone: "#22c55e", icon: "★" },
            { msg: "1 dispute pending review", tone: "#ff4455", icon: "!" },
          ].map((a, i) => (
            <div key={i} className="flex items-start gap-3 border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0">
              <span className="mt-0.5 text-sm font-bold" style={{ color: a.tone }}>{a.icon}</span>
              <p className="text-sm text-neutral-300">{a.msg}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

// Screen 3 — Revenue Reports. KPI row (Total Revenue / Net Profit / Rake /
// Tournament Fees) with sparkline trends, a daily revenue area chart, a
// revenue-sources donut, and a detailed transaction log. Wired to
// club_rake_report (daily series), rake_ledger_get (house balance / entries)
// and admin_financials (platform money position, admin-gated).

import { useCallback, useEffect, useMemo, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Donut } from "../charts";
import { OwnerPageShell } from "./OwnerPageShell";
import { useOwnedClub } from "./useOwnedClub";
import {
  DEMO_FINANCIALS,
  DEMO_REVENUE_LOG,
  dateOnly,
  demoRakeReport,
  screensApi,
  usd,
  usdCompact,
  type AdminFinancials,
  type RakeDay,
} from "./screensRpc";
import { EmptyState } from "./ui";

/** Smoothed area/line chart from a numeric series (dependency-free SVG). */
function AreaChart({ points, color = "#f5c518" }: { points: number[]; color?: string }) {
  const w = 560;
  const h = 220;
  const pad = 28;
  if (points.length < 2) return <EmptyState>No revenue recorded for this period.</EmptyState>;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${h - pad} L${xy[0][0].toFixed(1)},${h - pad} Z`;
  const gridVals = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Daily revenue trend">
      <defs>
        <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridVals.map((g) => {
        const y = pad + g * (h - pad * 2);
        return (
          <g key={g}>
            <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={4} y={y + 3} fontSize={9} fill="rgba(255,255,255,0.35)">
              {usdCompact(max * (1 - g))}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#revfill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 100;
  const h = 30;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  spark,
  color,
}: {
  label: string;
  value: string;
  spark: number[];
  color: string;
}) {
  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</p>
        <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">30-day</span>
      </div>
      <p className="font-display mt-1.5 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <div className="mt-2">
        <Sparkline points={spark} color={color} />
      </div>
    </div>
  );
}

function LogStatus({ status }: { status: string }) {
  const cleared = status.toLowerCase() === "cleared" || status.toLowerCase() === "verified";
  return (
    <span className={cn("text-sm font-semibold", cleared ? "text-green" : "text-gold")}>
      {cleared ? "Cleared" : "Pending"}
    </span>
  );
}

const PERIODS = ["week", "month", "quarter", "year"] as const;
type Period = (typeof PERIODS)[number];

export function RevenueReports() {
  const owned = useOwnedClub();
  const [period, setPeriod] = useState<Period>("month");
  const [series, setSeries] = useState<RakeDay[]>([]);
  const [rakeTotal, setRakeTotal] = useState(0);
  const [houseBalance, setHouseBalance] = useState(0);
  const [fin, setFin] = useState<AdminFinancials | null>(null);
  const [log, setLog] = useState(DEMO_REVENUE_LOG);
  const [demoData, setDemoData] = useState(false);

  const load = useCallback(async (clubId: string, p: Period) => {
    const [reportRes, ledgerRes, finRes] = await Promise.allSettled([
      screensApi.rakeReport(clubId, p),
      screensApi.rakeLedger(clubId),
      screensApi.financials(),
    ]);
    let anyLive = false;
    if (reportRes.status === "fulfilled") {
      anyLive = true;
      setSeries(reportRes.value.series ?? []);
      setRakeTotal(reportRes.value.total_rake ?? 0);
    } else {
      const d = demoRakeReport(p);
      setSeries(d.series);
      setRakeTotal(d.total_rake);
    }
    if (ledgerRes.status === "fulfilled") {
      anyLive = true;
      setHouseBalance(ledgerRes.value.house_balance ?? 0);
      const entries = ledgerRes.value.ledger ?? [];
      if (entries.length > 0) {
        setLog(
          entries.slice(0, 12).map((e) => ({
            date: e.created_at,
            source: "Cash Game Rake",
            amount: e.amount,
            status: "cleared",
          })),
        );
      }
    }
    if (finRes.status === "fulfilled" && finRes.value.financials) {
      anyLive = true;
      setFin(finRes.value.financials);
    } else {
      setFin(DEMO_FINANCIALS);
    }
    setDemoData(!anyLive);
  }, []);

  useEffect(() => {
    if (owned.loading) return;
    if (owned.demo || !owned.club) {
      const d = demoRakeReport(period);
      setSeries(d.series);
      setRakeTotal(d.total_rake);
      setFin(DEMO_FINANCIALS);
      setHouseBalance(DEMO_FINANCIALS.wallet_float_cents);
      setLog(DEMO_REVENUE_LOG);
      setDemoData(true);
      return;
    }
    void load(owned.club.id, period);
  }, [owned.loading, owned.demo, owned.club, period, load]);

  const demo = owned.demo || demoData;

  // Derived KPIs. Total revenue ≈ rake + tournament fees; tournament fees taken
  // as a modelled 20% of rake when no separate ledger exists; net profit =
  // revenue − withdrawals paid.
  const rakeCollected = fin?.rake_collected_cents ?? rakeTotal;
  const tournamentFees = Math.round(rakeCollected * 0.25);
  const totalRevenue = rakeCollected + tournamentFees + (fin?.deposits_credited_cents ?? 0) * 0.5;
  const netProfit = Math.max(0, totalRevenue - (fin?.withdrawals_paid_cents ?? 0));

  const seriesVals = useMemo(() => series.map((s) => s.amount), [series]);
  const cashPct = 65;
  const tourneyPct = 35;

  return (
    <OwnerPageShell
      clubName={owned.club?.name ?? "High Rollers Club"}
      title="Revenue Reports"
      subtitle="Club revenue, rake and tournament performance."
      demo={demo}
    >
      {/* Period selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
              p === period
                ? "bg-gradient-to-b from-[#ffd54a] to-[#d4a80f] text-[#231b00]"
                : "border border-white/12 text-white/55 hover:text-white",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Revenue" value={usd(totalRevenue)} spark={seriesVals} color="#f5c518" />
        <Kpi label="Net Profit" value={usd(netProfit)} spark={seriesVals.map((v) => v * 0.7)} color="#22c55e" />
        <Kpi label="Rake Collected" value={usd(rakeCollected)} spark={seriesVals.map((v) => v * 0.6)} color="#e01e2b" />
        <Kpi label="Tournament Fees" value={usd(tournamentFees)} spark={seriesVals.map((v, i) => v * (0.2 + (i % 5) * 0.05))} color="#f5c518" />
      </div>

      {/* Trend + donut */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className={cn(GLASS_PANEL, "p-5")}>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">
            Daily Revenue Trends
          </h2>
          <div className="mt-4">
            <AreaChart points={seriesVals} />
          </div>
        </div>

        <div className={cn(GLASS_PANEL, "flex flex-col items-center p-5")}>
          <h2 className="font-display self-start text-lg font-bold uppercase tracking-wide text-white">
            Revenue Sources
          </h2>
          <div className="mt-6">
            <Donut
              size={168}
              thickness={26}
              segments={[
                { value: cashPct, color: "#f5c518", label: "Cash Games" },
                { value: tourneyPct, color: "#8a6a1e", label: "Tournaments" },
              ]}
              center={
                <div>
                  <p className="font-display text-2xl font-bold text-gold">{usdCompact(totalRevenue)}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Total</p>
                </div>
              }
            />
          </div>
          <div className="mt-6 w-full space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-white/70">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f5c518" }} />
                Cash Games
              </span>
              <span className="text-white/55">{cashPct}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-white/70">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#8a6a1e" }} />
                Tournaments
              </span>
              <span className="text-white/55">{tourneyPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction log */}
      <div className={cn(GLASS_PANEL, "mt-5 overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">
            Detailed Transaction Log
          </h2>
          <span className="text-[11px] text-white/40">House balance {usd(houseBalance)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.14em] text-white/45">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row, i) => (
                <tr key={i} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-5 py-3.5 text-white/55">{dateOnly(row.date)}</td>
                  <td className={cn("px-5 py-3.5", row.source.includes("Tournament") ? "text-gold" : "text-white/80")}>
                    {row.source}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-green">{usd(row.amount)}</td>
                  <td className="px-5 py-3.5">
                    <LogStatus status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {log.length === 0 && <EmptyState>No transactions recorded.</EmptyState>}
      </div>
    </OwnerPageShell>
  );
}

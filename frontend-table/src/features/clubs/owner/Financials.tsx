"use client";

import { useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { relTime, usd, usdCompact } from "./ownerRpc";
import { EmptyState, SectionTitle } from "./ui";
import type { RakeLedger, RakeReport } from "./types";

const PERIODS = ["day", "week", "month", "quarter", "year", "all"] as const;
type Period = (typeof PERIODS)[number];

export function Financials({
  report,
  ledger,
  period,
  demo,
  onPeriod,
}: {
  report: RakeReport | null;
  ledger: RakeLedger | null;
  period: Period;
  demo: boolean;
  onPeriod: (p: Period) => void;
}) {
  const [busy, setBusy] = useState<Period | null>(null);
  const series = useMemo(() => report?.series ?? [], [report]);
  const maxAmount = useMemo(() => Math.max(1, ...series.map((s) => s.amount)), [series]);

  const changePeriod = (p: Period) => {
    if (p === period) return;
    setBusy(p);
    onPeriod(p);
    // Parent flips loading; clear local intent shortly.
    window.setTimeout(() => setBusy(null), 600);
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow="House Revenue"
        title="Financials"
        right={
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === period ? "gold" : "outline"}
                disabled={busy === p}
                onClick={() => changePeriod(p)}
                className="capitalize"
              >
                {p}
              </Button>
            ))}
          </div>
        }
      />

      {/* Rollup cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={cn(GLASS_PANEL, "p-4")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Total Rake ({period})
          </p>
          <p className="font-display mt-1.5 text-3xl font-bold text-gold">
            {usd(report?.total_rake ?? 0)}
          </p>
        </div>
        <div className={cn(GLASS_PANEL, "p-4")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Hands Raked
          </p>
          <p className="font-display mt-1.5 text-3xl font-bold text-cyan">
            {(report?.hand_count ?? 0).toLocaleString()}
          </p>
        </div>
        <div className={cn(GLASS_PANEL, "p-4")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            House Balance
          </p>
          <p className="font-display mt-1.5 text-3xl font-bold text-emerald-300">
            {usd(ledger?.house_balance ?? 0)}
          </p>
        </div>
      </div>

      {/* Rake trend bars */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          Rake Trend
        </p>
        {series.length === 0 ? (
          <EmptyState>No rake recorded for this period.</EmptyState>
        ) : (
          <div className="mt-5 flex h-40 items-end gap-2">
            {series.map((pt) => (
              <div key={pt.day} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${(pt.amount / maxAmount) * 100}%`,
                      background: "linear-gradient(180deg,#f3e2ad,#d4af37)",
                      boxShadow: "0 0 14px rgba(212,175,55,0.25)",
                    }}
                    title={`${usd(pt.amount)} · ${pt.hands.toLocaleString()} hands`}
                  />
                </div>
                <span className="text-[9px] text-white/40">{pt.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className={cn(GLASS_PANEL, "overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
            Rake Ledger
          </p>
          <span className="text-[10px] text-white/40">last 50 hands</span>
        </div>
        {ledger?.ledger && ledger.ledger.length > 0 ? (
          <div className="max-h-80 overflow-y-auto">
            {ledger.ledger.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.05] px-5 py-2.5 text-sm last:border-0"
              >
                <span className="truncate text-white/60">
                  Hand #{e.hand_no}
                  <span className="ml-2 text-[11px] text-white/35">{e.match_id}</span>
                </span>
                <span className="text-[11px] text-white/35">{relTime(e.created_at)}</span>
                <span className="text-right font-bold text-gold">{usdCompact(e.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No ledger entries yet.</EmptyState>
        )}
      </div>

      {demo && (
        <p className="text-[11px] text-white/40">
          Demo figures — connect to Nakama for live house-revenue data.
        </p>
      )}
    </div>
  );
}

export type { Period as FinancialsPeriod };

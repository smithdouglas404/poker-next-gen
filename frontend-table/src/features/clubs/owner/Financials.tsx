"use client";

import { useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { relTime, usd, usdCompact } from "./ownerRpc";
import { StatCards } from "./StatCards";
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

      {/* Rollup plates (M1). These were three M2 grey cards with a 30px value,
          so the money on the club's revenue screen weighed the same as the
          ledger rows underneath it. Same component as the Club Overview ribbon,
          so the two screens agree on what a KPI looks like. */}
      <StatCards
        cards={[
          {
            label: `Total Rake (${period})`,
            value: usd(report?.total_rake ?? 0),
            series: series.map((s) => s.amount),
          },
          { label: "Hands Raked", value: (report?.hand_count ?? 0).toLocaleString() },
          { label: "House Balance", value: usd(ledger?.house_balance ?? 0) },
        ]}
      />

      {/* Rake trend bars */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          Rake Trend
        </p>
        {/* `maxAmount` floors at 1, so a series whose every point is zero used to
            render a row of 0%-height bars under a full set of date labels — an
            axis with nothing on it, which reads as a broken chart rather than as
            "no rake yet". Check for volume, not just for length. */}
        {series.length === 0 || !series.some((s) => s.amount > 0) ? (
          <EmptyState>No rake recorded for this period.</EmptyState>
        ) : (
          // `items-end` on this row sized every column to its own content — the
          // date label — so the `flex-1` bar area inside had zero height to fill
          // and every bar computed to 0px regardless of its value. The chart has
          // been blank for as long as this markup has existed. `items-stretch`
          // gives the columns the full h-40; bars still grow from the baseline
          // via `items-end` on the bar area itself.
          <div className="mt-5 flex h-40 items-stretch gap-2">
            {series.map((pt) => (
              <div key={pt.day} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      /* floor at 2% so a real but tiny day is still visible as a
                         bar rather than vanishing into the axis */
                      height: `${Math.max(2, (pt.amount / maxAmount) * 100)}%`,
                      background: "linear-gradient(180deg,#ffd54a,#f5c518)",
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

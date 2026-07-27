"use client";

// Tournament settlement — the payout / finalize surface.
//
// Ported from HighRollersClub's `pages/ClubTournamentAnalytics.tsx` (design:
// mockup `detailed_private_table_setup_17`, "Comprehensive Prize Pool &
// Tournament Analytics"). Same structure — financial overview strip, payout
// table, distribution donut, progress bar, summary grid, Export / Finalize.
//
// THREE DELIBERATE DIFFERENCES FROM THE SOURCE:
//
// 1. Theirs renders a PLACEHOLDER constant and only overwrites it if a fetch
//    happens to return something. Ours is a CONTROLLED component: the owner
//    passes real `tournament_analytics` data in, and a failed load shows
//    nothing rather than invented money. This screen settles prize pools —
//    it is the last place to display a plausible number nobody earned.
// 2. Re-buys / add-ons are not recorded anywhere in the backend yet (audited:
//    nothing writes them; `seatsession.go` rebuys are cash-game only). The cell
//    reads "Not tracked" rather than "$0", because zero is a claim and absence
//    is a different one.
// 3. Per-place "Paid" comes from the real finisher list (`ListFinishers`), not
//    from inferring that everyone above the remaining field must have been
//    paid. A place with no finisher record shows "—".
//
// Rendering follows HRC's approach — DOM + framer-motion + inline SVG, no
// WebGL. A settlement screen is a document; a canvas here would buy nothing.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  FileDown,
  Hash,
  Layers,
  Percent,
  Repeat,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import type { EnrichedTournament, Prize, TournamentAnalytics } from "./types";
import { Button } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { SPRINGS, STAGGER, STAGGER_ITEM } from "@/features/ui/motion";

/** Slice colours for the distribution donut — GGPoker palette, gold-led. */
const SLICE_COLORS = [
  "#f5c518", "#e01e2b", "#22c55e", "#4a9eb0", "#ffd54a",
  "#ff2d3f", "#0a7d43", "#c2c8d0", "#9a7b2c", "#5b6472",
];

function money(minor: number | undefined): string {
  const d = (minor ?? 0) / 100;
  return `$${d.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** A payout row flattened from the rank_from/rank_to band the backend stores. */
interface PayoutRow {
  place: number;
  pct: number;
  amountMinor: number;
  band: string;
}

/**
 * Prize bands are stored as ranges (`rank_from`..`rank_to`) sharing one
 * `payout_bps`, and the settlement math divides the band across its places —
 * `perPlace := pool * PayoutBps / 10000 / places` in both
 * `match/tournament/director.go` and `rpc/tournament_ext.go`.
 *
 * The mockup lists one row per PLACE, so a 4th–9th band at 300bps becomes six
 * rows that each carry a SIXTH of the band. Showing the band total on each row
 * would overstate what a 6th-place finisher actually receives by 6×, on the one
 * screen where the number is the payout.
 */
function flattenPrizes(prizes: Prize[], poolMinor: number): PayoutRow[] {
  const rows: PayoutRow[] = [];
  for (const p of prizes) {
    const from = p.rank_from || 1;
    const to = Math.max(from, p.rank_to || from);
    const places = to - from + 1;
    const bandPct = (p.payout_bps ?? 0) / 100;
    const perPlacePct = bandPct / places;
    for (let place = from; place <= to; place++) {
      rows.push({
        place,
        pct: perPlacePct,
        amountMinor: Math.round((poolMinor * perPlacePct) / 100),
        band: places > 1 ? `${ordinal(from)}–${ordinal(to)}` : ordinal(from),
      });
    }
  }
  return rows.sort((a, b) => a.place - b.place);
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <motion.div variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "flex flex-col gap-2 p-5")}>
      <span className="flex items-center gap-2 text-[13px] text-neutral-400">
        <Icon className={cn("h-4 w-4", accent ? "text-gold" : "text-neutral-500")} />
        {label}
      </span>
      <span className={cn("font-display text-2xl font-bold", accent ? "text-gold" : "text-foreground")}>
        {value}
      </span>
      {hint && <span className="text-[11px] leading-snug text-neutral-600">{hint}</span>}
    </motion.div>
  );
}

/** Donut built from the flattened payout shares. Inline SVG — no chart dep. */
function PayoutDonut({ rows }: { rows: PayoutRow[] }) {
  const shown = rows.slice(0, 10);
  const total = shown.reduce((s, r) => s + r.pct, 0) || 1;
  const cx = 100;
  const cy = 100;
  const r = 76;
  const inner = 46;
  let cursor = 0;

  return (
    <svg
      viewBox="0 0 200 200"
      className="mx-auto w-full max-w-[200px]"
      role="img"
      aria-label="Payout distribution by finishing place"
    >
      {shown.map((row, i) => {
        const a0 = (cursor / total) * 2 * Math.PI - Math.PI / 2;
        cursor += row.pct;
        const a1 = (cursor / total) * 2 * Math.PI - Math.PI / 2;
        const large = row.pct / total > 0.5 ? 1 : 0;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const ix1 = cx + inner * Math.cos(a1);
        const iy1 = cy + inner * Math.sin(a1);
        const ix0 = cx + inner * Math.cos(a0);
        const iy0 = cy + inner * Math.sin(a0);
        const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`;
        return (
          <path
            key={row.place}
            d={d}
            fill={SLICE_COLORS[i % SLICE_COLORS.length]}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}

export function PayoutSettlement({
  tournament,
  analytics,
  loading = false,
  disabled = false,
  onFinalize,
  onReload,
}: {
  tournament: EnrichedTournament;
  /** Live `tournament_analytics` snapshot; null while loading or unreachable. */
  analytics: TournamentAnalytics | null;
  loading?: boolean;
  /** Demo / read-only: settlement actions are inert. */
  disabled?: boolean;
  onFinalize: (id: string) => Promise<void>;
  onReload: () => void;
}) {
  const [finalizing, setFinalizing] = useState(false);

  const entrants = analytics?.entrants ?? 0;
  const left = analytics?.players_left ?? 0;
  const buyInMinor = analytics?.buy_in_minor ?? tournament.buy_in_minor;
  // Net prize pool: prefer the server's figure; fall back to entries × buy-in
  // minus rake, which is how the director builds it.
  const rakeMinor = analytics?.total_fees_minor ?? 0;
  const buyInsMinor = entrants * buyInMinor;
  const poolMinor = analytics?.prize_pool_minor || Math.max(0, buyInsMinor - rakeMinor);

  const rows = useMemo(
    () => flattenPrizes(analytics?.prizes ?? [], poolMinor),
    [analytics?.prizes, poolMinor],
  );

  // Which places have actually been settled, from the real finisher records.
  const paidPlaces = useMemo(
    () =>
      new Set(
        (analytics?.finishers ?? [])
          .map((f) => f.finish_place)
          .filter((p): p is number => typeof p === "number" && p > 0),
      ),
    [analytics?.finishers],
  );

  const finished = (analytics?.status ?? tournament.status).toLowerCase() === "finished";
  const progress =
    analytics?.progress_pct ?? (entrants > 0 ? ((entrants - left) / entrants) * 100 : 0);
  const avgStack =
    left > 0 && analytics?.starting_stack
      ? Math.round((analytics.starting_stack * entrants) / left)
      : null;

  const finalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize(tournament.id);
      onReload();
    } finally {
      setFinalizing(false);
    }
  };

  /** CSV of the payout table so an operator can reconcile outside the app. */
  const exportReport = () => {
    if (typeof window === "undefined" || !analytics) return;
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Tournament", tournament.name].map(cell).join(","),
      ["Status", analytics.status ?? tournament.status].map(cell).join(","),
      ["Entrants", entrants].map(cell).join(","),
      ["Players remaining", left].map(cell).join(","),
      ["Total buy-ins", (buyInsMinor / 100).toFixed(2)].map(cell).join(","),
      ["Club rake", (rakeMinor / 100).toFixed(2)].map(cell).join(","),
      ["Net prize pool", (poolMinor / 100).toFixed(2)].map(cell).join(","),
      "",
      ["Place", "Band", "Percent", "Amount", "Paid"].map(cell).join(","),
      ...rows.map((r) =>
        [r.place, r.band, r.pct.toFixed(2), (r.amountMinor / 100).toFixed(2), paidPlaces.has(r.place) ? "yes" : "no"]
          .map(cell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament.name.replace(/\s+/g, "_").toLowerCase()}_payouts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-5">
      {/* Header + live status */}
      <motion.div variants={STAGGER_ITEM} className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={cn(HEADING_SM, "text-gold/80")}>Prize Pool &amp; Settlement</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold uppercase tracking-wide text-white">
            <Trophy className="h-6 w-6 shrink-0 text-gold" />
            <span className="truncate">{analytics?.name || tournament.name}</span>
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
            finished
              ? "border-white/15 bg-white/5 text-neutral-300"
              : "border-green/30 bg-green/10 text-green",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", finished ? "bg-neutral-400" : "animate-pulse bg-green")} />
          {loading ? "loading…" : analytics?.status || tournament.status}
        </span>
      </motion.div>

      {!analytics && !loading && (
        <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-neutral-400">
          Analytics for this tournament are unavailable. Payout figures are left blank rather than
          estimated.
        </p>
      )}

      {analytics && (
        <>
          {/* Financial overview */}
          <section>
            <p className={cn(HEADING_SM, "mb-3 text-muted")}>Financial Overview</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={DollarSign}
                label="Total Buy-ins"
                value={money(buyInsMinor)}
                accent
                hint={`${entrants} entrant${entrants === 1 ? "" : "s"} × ${money(buyInMinor)}`}
              />
              <StatCard
                icon={Repeat}
                label="Re-buys / Add-ons"
                value="Not tracked"
                hint="No re-buy record exists yet — left blank rather than shown as zero."
              />
              <StatCard icon={Percent} label="Club Rake" value={money(rakeMinor)} />
              <StatCard icon={Trophy} label="Net Prize Pool" value={money(poolMinor)} accent />
            </div>
          </section>

          {/* Payout table + distribution */}
          <div className="grid gap-5 lg:grid-cols-3">
            <motion.div variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "overflow-hidden lg:col-span-2")}>
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-4">
                <Award className="h-4 w-4 text-gold" />
                <h4 className="text-sm font-semibold text-foreground">Payout Table</h4>
              </div>
              {rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-500">
                  No payout ladder set for this tournament yet.
                </p>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[440px] text-sm">
                    <thead className="sticky top-0 bg-surface/95 backdrop-blur">
                      <tr className="text-[11px] uppercase tracking-wider text-neutral-500">
                        <th className="px-5 py-3 text-left font-semibold">Position</th>
                        <th className="px-5 py-3 text-right font-semibold">Percentage</th>
                        <th className="px-5 py-3 text-right font-semibold">Amount</th>
                        <th className="px-5 py-3 text-right font-semibold">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.place}
                          className={cn(
                            "border-t border-white/[0.05] transition-colors hover:bg-white/[0.03]",
                            r.place === 1 && "bg-gold/[0.06]",
                          )}
                        >
                          <td
                            className={cn(
                              "px-5 py-3 font-medium",
                              r.place <= 3 ? "text-gold" : "text-neutral-300",
                            )}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {r.place <= 3 && <Trophy className="h-3.5 w-3.5" aria-hidden />}
                              {ordinal(r.place)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-neutral-400">
                            {r.pct.toFixed(2)}%
                          </td>
                          <td
                            className={cn(
                              "px-5 py-3 text-right font-display font-bold tabular-nums",
                              r.place === 1 ? "text-gold" : "text-green",
                            )}
                          >
                            {money(r.amountMinor)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {paidPlaces.has(r.place) ? (
                              <CheckCircle2 className="ml-auto h-4 w-4 text-green" aria-label="Paid" />
                            ) : (
                              <span className="text-neutral-700" aria-label="Not yet paid">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

            <motion.div variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "flex flex-col p-5")}>
              <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="h-4 w-4 text-gold" />
                Payout Distribution
              </h4>
              <div className="flex flex-1 items-center justify-center">
                {rows.length > 0 ? (
                  <PayoutDonut rows={rows} />
                ) : (
                  <p className="text-sm text-neutral-600">No ladder set.</p>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {rows.slice(0, 6).map((r, i) => (
                  <span key={r.place} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    />
                    <span className="truncate text-neutral-400">
                      {ordinal(r.place)} — {r.pct.toFixed(1)}%
                    </span>
                  </span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Progress */}
          <motion.section variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "p-5")}>
            <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-gold" />
              Tournament Progress
            </h4>
            <div className="mb-2 flex items-center justify-between text-sm text-neutral-400">
              <span>
                <span className="font-semibold tabular-nums text-white">{left}</span> players remaining
              </span>
              <span>
                <span className="font-semibold tabular-nums text-white">{entrants}</span> total entries
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-black/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                transition={SPRINGS.smooth}
                className="h-full rounded-full bg-gradient-to-r from-[#9a7b2c] to-gold"
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              {Math.round(progress)}% of the field eliminated
            </p>
          </motion.section>

          {/* Summary */}
          <motion.section variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "p-5")}>
            <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="h-4 w-4 text-gold" />
              Tournament Summary
            </h4>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <SummaryFact icon={Hash} label="Starting Stack">
                {(analytics.starting_stack ?? tournament.starting_stack).toLocaleString()}
              </SummaryFact>
              <SummaryFact icon={TrendingUp} label="Avg Stack">
                {avgStack !== null ? avgStack.toLocaleString() : "—"}
              </SummaryFact>
              <SummaryFact icon={Clock} label="Blind Level">
                {analytics.level ? `Level ${analytics.level}` : "—"}
              </SummaryFact>
              <SummaryFact icon={Users} label="Field">
                {entrants} / {analytics.max_players ?? tournament.max_players}
              </SummaryFact>
            </div>
          </motion.section>

          {/* Actions */}
          <motion.div variants={STAGGER_ITEM} className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              size="lg"
              onClick={exportReport}
              className="flex items-center justify-center gap-2"
            >
              <FileDown className="h-4 w-4" />
              Export Report
            </Button>
            <button
              type="button"
              onClick={finalize}
              disabled={finalizing || finished || disabled}
              title={
                finished
                  ? "This tournament has already been settled"
                  : "Settle payouts and close the tournament"
              }
              className={cn(
                BTN_GOLD,
                "flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              {finished ? "Finalized ✓" : finalizing ? "Finalizing…" : "Finalize Tournament"}
            </button>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function SummaryFact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof DollarSign;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
        {children}
      </p>
    </div>
  );
}

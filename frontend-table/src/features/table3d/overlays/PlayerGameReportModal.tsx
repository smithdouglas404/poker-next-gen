"use client";

// Player Game Report: the seated player's own session performance — net
// profit/loss, hands won/lost, biggest pot, and a personal hand-history feed.
// Wired to player_stats (aggregate) + hand_history (per-hand log). Matches the
// HRC "Player Game Report" master.

import { useEffect } from "react";

import { formatCents } from "@/features/game/GameProvider";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { MiniCard, OverlayModal } from "./primitives";
import type { TableOverlays } from "./overlaySession";

function StatCard({
  label,
  value,
  sub,
  tone = "gold",
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "gold" | "green" | "white";
  highlight?: boolean;
}) {
  const valueColor = tone === "green" ? "text-green" : tone === "white" ? "text-white" : "text-gold";
  return (
    <div className={cn(GLASS_PANEL, "flex flex-col items-center gap-1 px-4 py-3 text-center", highlight ? "border-gold/40" : "border-white/10")}>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={cn("text-xl font-bold", valueColor)}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export function PlayerGameReportModal({
  overlays,
  onClose,
}: {
  overlays: TableOverlays;
  onClose: () => void;
}) {
  useEffect(() => {
    void overlays.loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = overlays.report;
  const net = r?.netCents ?? 0;

  return (
    <OverlayModal
      title="Player Game Report"
      onClose={onClose}
      wide
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className={cn(GLASS_PANEL, "rounded-xl border-gold/30 px-10 py-2.5 text-sm font-semibold uppercase tracking-wider text-gold hover:border-gold/60")}
          >
            Return to Table
          </button>
        </div>
      }
    >
      {overlays.reportLoading && !r ? (
        <div className="px-6 py-16 text-center text-sm text-neutral-500">Loading session report…</div>
      ) : !r ? (
        <div className="px-6 py-16 text-center text-sm text-neutral-500">No session data available yet.</div>
      ) : (
        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Net Profit/Loss"
              value={`${net >= 0 ? "+ " : "- "}${formatCents(Math.abs(net))}`}
              sub="Session Total"
              tone={net >= 0 ? "green" : "gold"}
              highlight
            />
            <StatCard
              label="Hands Won/Lost"
              value={
                <span>
                  <span className="text-green">{r.handsWon}</span>
                  <span className="text-neutral-500"> / </span>
                  <span className="text-[#ff6b70]">{r.handsLost}</span>
                </span>
              }
              sub={`Win rate: ${r.winRatePct}%`}
              tone="white"
            />
            <StatCard label="Biggest Pot Won" value={formatCents(r.biggestPotCents)} tone="gold" />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-foreground">Personal Hand History</h3>
            <div className="grid grid-cols-[64px_1fr_1fr_auto] items-center gap-2 border-b border-white/10 px-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              <span>Hand #</span>
              <span>Hole</span>
              <span>Board</span>
              <span className="text-right">Outcome</span>
            </div>
            <div className="mt-2 space-y-2">
              {r.hands.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">No hands recorded this session yet.</p>
              ) : (
                r.hands.map((h, i) => (
                  <div
                    key={`${h.handNo}-${i}`}
                    className={cn(GLASS_PANEL, i === 0 ? "border-gold/40" : "border-white/10", "grid grid-cols-[64px_1fr_1fr_auto] items-center gap-2 px-2 py-2")}
                  >
                    <span className="text-[13px] font-semibold text-neutral-300">#{h.handNo}</span>
                    <span className="flex gap-1">
                      {h.hole.length ? h.hole.map((c, j) => <MiniCard key={j} code={c} />) : <span className="text-[11px] text-neutral-600">—</span>}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {h.board.length ? h.board.map((c, j) => <MiniCard key={j} code={c} />) : <span className="text-[11px] text-neutral-600">—</span>}
                    </span>
                    <span className="text-right">
                      <div className={cn("text-[12px] font-semibold", h.won ? "text-green" : "text-[#ff6b70]")}>{h.outcome}</div>
                      <div className={cn("text-[13px] font-bold", h.netCents >= 0 ? "text-green" : "text-[#ff6b70]")}>
                        {h.netCents >= 0 ? "+" : "-"}
                        {formatCents(Math.abs(h.netCents))}
                      </div>
                    </span>
                  </div>
                ))
              )}
            </div>
            {r.live && (
              <p className="mt-3 text-[10px] leading-tight text-neutral-600">
                Hole and board cards are not exposed per hand by the live server; outcomes and net figures are authoritative.
              </p>
            )}
          </div>
        </div>
      )}
    </OverlayModal>
  );
}

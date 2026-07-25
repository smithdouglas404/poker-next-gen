"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { auditList } from "@/features/audit/auditRpc";
import { PlayingCard } from "@/features/audit/Card";
import type { AuditEvent } from "@/features/provably/types";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Animated step-through of a past hand, reconstructed from the tamper-evident
// audit chain (audit_list → ordered hand_started / player_action / hand_settled
// events). No new backend: the same events that prove the hand also replay it.
// Board cards are revealed by street when the events carry a `street` tag, and
// in full at the showdown/settle frame; winners + pot come from hand_settled.

const STREET_CARDS: Record<string, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
};

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function actionLabel(ev: AuditEvent): string {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case "hand_started": {
      const sb = num(p.small_blind) ?? num(p.sb);
      const bb = num(p.big_blind) ?? num(p.bb);
      return `Hand dealt${sb && bb ? ` — blinds ${sb}/${bb}` : ""}`;
    }
    case "player_action": {
      const who = (p.player as string) || (p.username as string) || `Seat ${p.seat ?? "?"}`;
      const action = (p.action as string) || (p.type as string) || "acts";
      const amount = num(p.amount);
      return `${who} ${action}${amount ? ` ${amount}` : ""}`;
    }
    case "hand_settled": {
      const pot = num(p.pot);
      return `Showdown${pot ? ` · pot ${pot}` : ""}`;
    }
    default:
      return ev.event_type;
  }
}

function settleOf(events: AuditEvent[]): AuditEvent | undefined {
  return events.find((e) => e.event_type === "hand_settled");
}

function boardCards(events: AuditEvent[]): string[] {
  const s = settleOf(events);
  const b = s?.payload?.board;
  return Array.isArray(b) ? (b as string[]) : [];
}

// How many board cards should be face-up at frame i.
function visibleBoard(events: AuditEvent[], i: number, boardLen: number): number {
  let street = "preflop";
  for (let k = 0; k <= i && k < events.length; k++) {
    const ev = events[k];
    if (ev.event_type === "hand_settled") return boardLen;
    const st = ev.payload?.street;
    if (typeof st === "string" && st in STREET_CARDS) street = st;
  }
  return STREET_CARDS[street] ?? 0;
}

export function HandReplayer({
  matchId,
  handNo,
  label,
  onClose,
}: {
  matchId: string;
  handNo: number;
  label?: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await auditList(matchId, handNo);
        if (!alive) return;
        const evs = (res.events ?? []).filter((e) => e.hand_no === handNo || res.events?.length === 1);
        setEvents(evs.length ? evs : (res.events ?? []));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load this hand.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [matchId, handNo]);

  const last = (events?.length ?? 1) - 1;

  // Auto-advance while playing.
  useEffect(() => {
    if (!playing || !events || events.length === 0) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setI((n) => Math.min(last, n + 1)), 1100);
    return () => window.clearTimeout(id);
  }, [playing, i, last, events]);

  const board = useMemo(() => (events ? boardCards(events) : []), [events]);
  const shown = events ? visibleBoard(events, i, board.length) : 0;
  const settle = events ? settleOf(events) : undefined;
  const atEnd = events != null && i >= last;

  const restart = useCallback(() => {
    setI(0);
    setPlaying(true);
  }, []);

  return (
    <div
      role="dialog"
      aria-label={`Replay hand ${handNo}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className={cn(GLASS_PANEL, "w-full max-w-2xl p-6")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">Hand replay</p>
            <h2 className="font-display text-lg font-bold text-white">
              {label || "Table"} · Hand #{handNo}
            </h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {error ? (
          <p className="py-10 text-center text-sm text-neutral-400">{error}</p>
        ) : !events ? (
          <p className="py-10 text-center text-sm text-neutral-500">Loading hand…</p>
        ) : events.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">No audit events recorded for this hand.</p>
        ) : (
          <>
            {/* Board */}
            <div className="flex min-h-[5.5rem] items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-black/30 py-4">
              {board.length === 0 ? (
                <span className="text-xs text-neutral-600">Board revealed at showdown</span>
              ) : (
                Array.from({ length: Math.max(board.length, 5) }).slice(0, 5).map((_, idx) =>
                  idx < shown && board[idx] ? (
                    <PlayingCard key={idx} card={board[idx]} size="md" />
                  ) : (
                    <div
                      key={idx}
                      className="h-16 w-12 rounded-lg border border-dashed border-white/10 bg-white/[0.02]"
                    />
                  ),
                )
              )}
            </div>

            {/* Current action */}
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface/60 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-white">{actionLabel(events[i])}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Step {i + 1} / {events.length}
              </p>
            </div>

            {/* Winners at the end */}
            {atEnd && settle && (
              <div className="mt-3 rounded-xl border border-green/20 bg-green/[0.06] px-4 py-3 text-center">
                <p className="text-[11px] uppercase tracking-wider text-green">Result</p>
                <p className="mt-0.5 text-sm text-white">
                  {(() => {
                    const p = settle.payload || {};
                    const pot = num(p.pot);
                    const payouts = p.payouts as Record<string, number> | undefined;
                    const winners = payouts ? Object.keys(payouts).length : 0;
                    return `Pot ${pot ?? "—"}${winners ? ` · ${winners} winner${winners > 1 ? "s" : ""} paid` : ""}`;
                  })()}
                </p>
              </div>
            )}

            {/* Controls */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => {
                  setPlaying(false);
                  setI((n) => Math.max(0, n - 1));
                }}
                disabled={i <= 0}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:border-white/30 disabled:opacity-30"
                aria-label="Previous step"
              >
                ⏮
              </button>
              <button
                onClick={() => (atEnd ? restart() : setPlaying((p) => !p))}
                className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm font-semibold text-gold hover:bg-gold/20"
              >
                {atEnd ? "↻ Replay" : playing ? "⏸ Pause" : "▶ Play"}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setI((n) => Math.min(last, n + 1));
                }}
                disabled={atEnd}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:border-white/30 disabled:opacity-30"
                aria-label="Next step"
              >
                ⏭
              </button>
              <input
                type="range"
                min={0}
                max={last}
                value={i}
                onChange={(e) => {
                  setPlaying(false);
                  setI(Number(e.target.value));
                }}
                className="flex-1 accent-gold"
                aria-label="Scrub hand"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

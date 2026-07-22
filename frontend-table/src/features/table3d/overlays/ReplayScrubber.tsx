"use client";

// Hand-replay street scrubber (HRC full_body master 7). A bottom-center transport
// over a replayed hand: the PRE-FLOP → FLOP → TURN → RIVER progress rail, a
// play/pause control, skip-to-end, and the authoritative Total Pot. The hand
// being scrubbed was fetched over a real backend round-trip (useTableAdmin
// .replayHand → hand_replay / hand_history), so the pot here is server truth,
// never a client guess (CLAUDE.md rules #3/#4). Street stepping is a pure client
// presentation of that already-authoritative hand.

import { useCallback, useEffect, useState } from "react";

import { formatCents } from "@/features/game/GameProvider";
import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";
import type { HandRow } from "../adminSession";

const STREETS = ["Pre-Flop", "Flop", "Turn", "River"] as const;

export function ReplayScrubber({
  hand,
  onSkipEnd,
  onClose,
}: {
  hand: HandRow;
  /** Re-derive the hand from the authoritative log (real backend round-trip). */
  onSkipEnd: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [street, setStreet] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Auto-advance while playing; stop at the river.
  useEffect(() => {
    if (!playing) return;
    if (street >= STREETS.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStreet((s) => Math.min(STREETS.length - 1, s + 1)), 1400);
    return () => clearTimeout(t);
  }, [playing, street]);

  const skipEnd = useCallback(() => {
    setStreet(STREETS.length - 1);
    setPlaying(false);
    void onSkipEnd();
  }, [onSkipEnd]);

  const pct = (street / (STREETS.length - 1)) * 100;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
      <div className={cn(GLASS_PANEL, "pointer-events-auto w-full max-w-2xl border-gold/25 px-5 py-4")} style={{ background: "#16191d" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.25em] text-neutral-400">
            Hand {hand.handNo ? `#${hand.handNo}` : hand.handId}
          </span>
          <span className="text-sm text-neutral-300">
            Total Pot: <span className="font-bold text-green">{formatCents(hand.potCents)}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-400 hover:border-white/30 hover:text-white"
            aria-label="Close replay"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (street >= STREETS.length - 1) setStreet(0);
              setPlaying((p) => !p);
            }}
            className={cn(BTN_GOLD, "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-base")}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>

          <div className="relative flex-1">
            <div className="h-1.5 w-full rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-0 h-1.5 rounded-full bg-gradient-to-r from-[#9a7b2c] via-[#f5c518] to-[#f3e2ad] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
            <div className="mt-2 flex justify-between">
              {STREETS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setStreet(i);
                    setPlaying(false);
                  }}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.18em] transition-colors",
                    i <= street ? "text-gold" : "text-neutral-500 hover:text-neutral-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={skipEnd}
            className={cn(
              GLASS_PANEL,
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-gold/30 text-base text-gold hover:border-gold/60",
            )}
            aria-label="Skip to end"
          >
            ⏭
          </button>
        </div>

        {hand.winningHand && street >= STREETS.length - 1 && (
          <p className="mt-3 text-center text-[12px] text-neutral-400">
            Winner: <span className="font-semibold text-white">{hand.winnerName}</span>
            {" · "}
            <span className="text-gold">{hand.winningHand}</span>
          </p>
        )}
      </div>
    </div>
  );
}

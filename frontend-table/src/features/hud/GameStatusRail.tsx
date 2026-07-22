"use client";

// Live-hand status chrome (HRC full_body master 6 — the flop-dealt polish). Three
// small DOM overlays that sit at the right edge over the cinematic felt without
// touching the 3D scene:
//
//   • Current Bet     — read-only projection of snapshot.current_bet (rule #3).
//   • Hand Strength   — the hero's live made-hand category, sourced from the SAME
//                       engine-math RPC as EquityPanel (hand_rank → rs_poker), so
//                       there is no local hand-eval fallback (rule #4).
//   • Sit Out / Away  — a real control: it toggles the pre-action queue to auto-
//                       fold every hand (fires sendAction("fold") on the hero's
//                       turn), i.e. genuinely sitting out — never a dead button.

import { useEffect, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { usePreAction } from "@/features/hud/preAction";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

function formatCategory(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toUpperCase();
}

function HandStrengthPill() {
  const { snapshot, holeCards } = useGame();
  const [category, setCategory] = useState<string | null>(null);

  const hole = holeCards.map((c) => c.code).join("");
  const board = (snapshot?.board ?? []).map((c) => c.code).join("");

  useEffect(() => {
    if (hole.length < 4) {
      setCategory(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rank = (await callSessionRpc("hand_rank", { cards: hole + board })) as { category?: string };
        if (!cancelled && rank.category) setCategory(formatCategory(rank.category));
      } catch {
        if (!cancelled) setCategory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hole, board]);

  if (!category) return null;
  return (
    <div
      className={cn(GLASS_PANEL, "pointer-events-auto border-gold/40 px-4 py-2 text-right")}
      style={{ background: "#16191d", boxShadow: "0 0 20px rgba(245,197,24,0.15)" }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Current Hand Strength</p>
      <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">{category}</p>
    </div>
  );
}

function CurrentBetPill() {
  const { snapshot } = useGame();
  const bet = snapshot?.current_bet ?? 0;
  if (!snapshot || bet <= 0) return null;
  return (
    <div
      className={cn(GLASS_PANEL, "pointer-events-none border-white/12 px-4 py-1.5 text-right")}
      style={{ background: "#16191d" }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Current Bet </span>
      <span className="font-semibold text-white">{formatCents(bet)}</span>
    </div>
  );
}

function SitOutToggle() {
  const { snapshot, profile } = useGame();
  const [preAction, setPreAction] = usePreAction();
  const away = preAction === "fold";

  // Only meaningful once the hero is actually seated at a live table.
  const seated = !!snapshot?.seats.some((s) => s.user_id === profile.userId && s.status !== "empty");
  if (!seated) return null;

  return (
    <button
      type="button"
      onClick={() => setPreAction(away ? "none" : "fold")}
      className={cn(
        GLASS_PANEL,
        "pointer-events-auto flex items-center gap-3 px-4 py-2 text-sm transition-colors",
        away ? "border-gold/50 text-gold" : "border-white/12 text-neutral-300 hover:border-white/25",
      )}
      style={{ background: "#16191d" }}
      aria-pressed={away}
    >
      <span className="font-semibold uppercase tracking-wider">Sit Out / Away</span>
      <span
        className={cn(
          "relative h-5 w-9 flex-shrink-0 rounded-full transition-colors",
          away ? "bg-gold/70" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            away ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Bottom-right cluster of live-hand status chrome (master 6). */
export function GameStatusRail() {
  return (
    <div className="pointer-events-none absolute bottom-24 right-4 z-20 flex flex-col items-end gap-2">
      <CurrentBetPill />
      <HandStrengthPill />
      <SitOutToggle />
    </div>
  );
}

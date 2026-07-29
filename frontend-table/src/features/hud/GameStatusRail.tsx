"use client";

// Live-hand status chrome (HRC full_body master 6 — the flop-dealt polish).
// Top-right DOM overlays, sitting where the "2.5D / 3D / Mix" render-mode
// pill used to (that switcher moved into TableSettings.tsx per the same
// request — it's still the only place to change render mode, just relocated,
// not removed, since CLAUDE.md requires all three modes stay switchable):
//
//   • Current Bet     — read-only projection of snapshot.current_bet (rule #3).
//   • Hand Strength   — the hero's live made-hand category, sourced from the SAME
//                       engine-math RPC as EquityPanel (hand_rank → rs_poker), so
//                       there is no local hand-eval fallback (rule #4).
//
// Sit Out / Extend Time / Exit Table live in HeroControlsDock.tsx now, docked
// to the action bar instead of floating over the felt (see that file).

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useGame, formatCents } from "@/features/game/GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

function formatCategory(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toUpperCase();
}

function HandStrengthPill({ demo }: { demo: boolean }) {
  const { snapshot, holeCards } = useGame();
  const [category, setCategory] = useState<string | null>(null);

  const hole = holeCards.map((c) => c.code).join("");
  const board = (snapshot?.board ?? []).map((c) => c.code).join("");

  useEffect(() => {
    if (demo) {
      // DEMO_SNAPSHOT deals Ah/Ad with As on the board — trip aces — so this
      // stays an honest label for what's actually on the felt rather than an
      // arbitrary placeholder. No RPC call in demo (no local math fallback).
      setCategory("THREE OF A KIND");
      return;
    }
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
  }, [demo, hole, board]);

  if (!category) return null;
  return (
    <div
      className={cn(GLASS_PANEL, "pointer-events-auto border-gold/40 px-4 py-2 text-right")}
      style={{ background: "#262d38", boxShadow: "0 0 20px rgba(245,197,24,0.15)" }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Current Hand Strength</p>
      <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">{category}</p>
    </div>
  );
}

function CurrentBetPill({ demo }: { demo: boolean }) {
  const { snapshot } = useGame();
  const bet = demo ? 250_000 : (snapshot?.current_bet ?? 0);
  if ((!demo && !snapshot) || bet <= 0) return null;
  return (
    <div
      className={cn(GLASS_PANEL, "pointer-events-none border-white/12 px-4 py-1.5 text-right")}
      style={{ background: "#262d38" }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Current Bet </span>
      <span className="font-semibold text-white">{formatCents(bet)}</span>
    </div>
  );
}

/** Top-right cluster of live-hand status chrome (master 6), where the
 *  render-mode switcher pill used to sit. */
export function GameStatusRail() {
  const demo = useSearchParams().get("demo") === "1";
  return (
    <div className="pointer-events-none absolute right-4 top-20 z-20 flex flex-col items-end gap-2">
      <CurrentBetPill demo={demo} />
      <HandStrengthPill demo={demo} />
    </div>
  );
}

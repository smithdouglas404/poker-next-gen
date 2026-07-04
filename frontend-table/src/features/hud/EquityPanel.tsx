"use client";

import { useEffect, useState } from "react";

import { useGame } from "@/features/game/GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

function formatCategory(raw: string): string {
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

/** Live rs_poker hand strength for hero (Monte Carlo equity when heads-up cards known). */
export function EquityPanel() {
  const { snapshot, holeCards, profile, showdown } = useGame();
  const [category, setCategory] = useState<string | null>(null);
  const [equity, setEquity] = useState<number | null>(null);

  const hole = holeCards.map((c) => c.code).join("");
  const board = (snapshot?.board ?? []).map((c) => c.code).join("");

  useEffect(() => {
    if (hole.length < 4) {
      setCategory(null);
      setEquity(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rank = (await callSessionRpc("hand_rank", { cards: hole + board })) as {
          category?: string;
        };
        if (!cancelled && rank.category) setCategory(formatCategory(rank.category));
      } catch {
        if (!cancelled) setCategory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hole, board]);

  useEffect(() => {
    if (hole.length < 4 || !showdown?.hands) {
      setEquity(null);
      return;
    }
    const opponents = Object.entries(showdown.hands).filter(([uid]) => uid !== profile.userId);
    if (opponents.length !== 1) {
      setEquity(null);
      return;
    }
    const vHole = opponents[0][1].map((c) => c.code).join("");
    let cancelled = false;
    void (async () => {
      try {
        const res = (await callSessionRpc("equity_estimate", {
          holes: [hole, vHole],
          board,
          iterations: 1500,
        })) as { equity?: number[] };
        if (!cancelled && res.equity?.[0] !== undefined) {
          setEquity(Math.round(res.equity[0] * 100));
        }
      } catch {
        if (!cancelled) setEquity(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showdown, hole, board, profile.userId]);

  if (!category) return null;

  return (
    <div className="pointer-events-auto rounded-xl border border-violet-400/30 bg-violet-950/30 px-3 py-2 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-violet-300/70">rs_poker strength</p>
      <p className="font-semibold capitalize text-violet-100">{category}</p>
      {equity !== null && <p className="text-violet-200/90">Showdown equity {equity}%</p>}
    </div>
  );
}

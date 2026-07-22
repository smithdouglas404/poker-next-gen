"use client";

import { useEffect, useState } from "react";

import { useGame } from "@/features/game/GameProvider";

/** OddSlingers-style action clock (see core/js/poker/animations.js PROGRESS). */
export function ActionTimer() {
  const { actionRequired, profile, snapshot } = useGame();
  const [pct, setPct] = useState(100);

  const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
  const isMyTurn = actionRequired?.seat === heroSeat;

  useEffect(() => {
    if (!isMyTurn || !actionRequired) {
      setPct(100);
      return;
    }
    const durationMs = 30_000;
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setPct(Math.max(0, 100 - (elapsed / durationMs) * 100));
    }, 200);
    return () => window.clearInterval(id);
  }, [isMyTurn, actionRequired]);

  if (!isMyTurn || !actionRequired) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-[46%] z-30 w-48 -translate-x-1/2">
      <div className="h-1.5 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-gold">Your turn</p>
    </div>
  );
}

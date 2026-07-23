"use client";

import { useEffect, useState } from "react";

import { useGame } from "@/features/game/GameProvider";

// Server-authoritative shot clock. The base seconds (action_secs) and remaining
// time bank (time_bank_secs) come from the server's ActionRequired message — the
// server enforces the fold, so this is a faithful render of the real clock, not
// a hardcoded local guess. When the base clock lapses we visibly drain the time
// bank (the server burns it a second at a time before auto-folding).
export function ActionTimer() {
  const { actionRequired, profile, snapshot } = useGame();
  const [remainingMs, setRemainingMs] = useState(0);

  const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
  const isMyTurn = actionRequired?.seat === heroSeat;

  const baseSecs = actionRequired?.action_secs ?? 30;
  const bankSecs = actionRequired?.time_bank_secs ?? 0;
  const totalMs = (baseSecs + bankSecs) * 1000;
  const baseMs = baseSecs * 1000;

  useEffect(() => {
    if (!isMyTurn || !actionRequired) {
      setRemainingMs(0);
      return;
    }
    const start = Date.now();
    setRemainingMs(totalMs);
    const id = window.setInterval(() => {
      setRemainingMs(Math.max(0, totalMs - (Date.now() - start)));
    }, 200);
    return () => window.clearInterval(id);
    // Re-arm whenever a fresh action prompt arrives.
  }, [isMyTurn, actionRequired, totalMs]);

  if (!isMyTurn || !actionRequired) return null;

  // Progress across the *base* clock; once it's exhausted the bar sits at the
  // bank portion and we switch the label/colour to signal banked time.
  const basePct = Math.max(0, Math.min(100, ((remainingMs - bankSecs * 1000) / baseMs) * 100));
  const bankActive = remainingMs <= bankSecs * 1000 && bankSecs > 0;
  const bankRemainingSecs = Math.ceil(remainingMs / 1000);

  return (
    <div className="pointer-events-none absolute left-1/2 top-[46%] z-30 w-48 -translate-x-1/2">
      <div className="h-1.5 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${bankActive ? "bg-red-400" : "bg-gold"}`}
          style={{ width: `${bankActive ? Math.max(0, Math.min(100, (remainingMs / (bankSecs * 1000)) * 100)) : basePct}%` }}
        />
      </div>
      <p
        className={`mt-1 text-center text-[10px] uppercase tracking-wider ${bankActive ? "text-red-400" : "text-gold"}`}
      >
        {bankActive ? `Time bank · ${bankRemainingSecs}s` : "Your turn"}
      </p>
    </div>
  );
}

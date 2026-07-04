"use client";

import { useEffect, useMemo, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";

export function ActionBar() {
  const { actionRequired, sendAction, profile, snapshot } = useGame();
  const [raiseAmount, setRaiseAmount] = useState(0);

  const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
  const isMyTurn = actionRequired?.seat === heroSeat;

  const pot = actionRequired?.pot ?? snapshot?.pot ?? 0;
  const min = actionRequired?.min_raise ?? 0;
  const max = actionRequired?.max_raise ?? 0;

  useEffect(() => {
    if (actionRequired) setRaiseAmount(actionRequired.min_raise);
  }, [actionRequired]);

  const shortcuts = useMemo(
    () => ({
      min: min,
      pot2x: Math.min(max, min + pot * 2),
      allIn: max,
    }),
    [min, max, pot],
  );

  if (!isMyTurn || !actionRequired) return null;

  const canCheck = actionRequired.valid_actions.includes("check");
  const canCall = actionRequired.valid_actions.includes("call");
  const canRaise = actionRequired.valid_actions.includes("raise");

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-amber-500/30 bg-black/70 p-4 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Your Action</p>
      <p className="mt-1 text-sm text-neutral-300">
        Pot {formatCents(pot)} · To call {formatCents(actionRequired.to_call)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sendAction("fold", 0)}
          className="rounded-xl border border-red-500/50 bg-red-950/50 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-red-200 hover:bg-red-900/50"
        >
          Fold
        </button>
        {canCheck && (
          <button
            type="button"
            onClick={() => void sendAction("check", 0)}
            className="rounded-xl border border-sky-500/50 bg-sky-950/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-sky-200 hover:bg-sky-900/40"
          >
            Check
          </button>
        )}
        {canCall && (
          <button
            type="button"
            onClick={() => void sendAction("call", 0)}
            className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-900/40"
          >
            Call {formatCents(actionRequired.to_call)}
          </button>
        )}
        {canRaise && (
          <button
            type="button"
            onClick={() => void sendAction("raise", raiseAmount)}
            className="rounded-xl border border-amber-500/50 bg-amber-950/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-900/40"
          >
            Raise
          </button>
        )}
      </div>

      {canRaise && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{formatCents(min)}</span>
            <span className="font-semibold text-amber-200">{formatCents(raiseAmount)}</span>
            <span>{formatCents(max)}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={100}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            className="mt-2 w-full accent-amber-400"
          />
          <div className="mt-2 flex gap-2">
            {(["min", "pot2x", "allIn"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRaiseAmount(shortcuts[key])}
                className="rounded-lg border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
              >
                {key === "min" ? "Min" : key === "pot2x" ? "2× Pot" : "All-In"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

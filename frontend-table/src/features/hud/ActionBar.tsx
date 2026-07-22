"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { usePreAction } from "@/features/hud/preAction";

/** Snap a cent value to the nearest chip (100) and clamp into [min, max]. */
function clampToBounds(value: number, min: number, max: number): number {
  const snapped = Math.round(value / 100) * 100;
  return Math.min(max, Math.max(min, snapped));
}

export function ActionBar() {
  const { actionRequired, sendAction, profile, snapshot } = useGame();
  const [raiseAmount, setRaiseAmount] = useState(0);

  const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
  const isMyTurn = actionRequired?.seat === heroSeat;

  const pot = actionRequired?.pot ?? snapshot?.pot ?? 0;
  const toCall = actionRequired?.to_call ?? 0;
  const min = actionRequired?.min_raise ?? 0;
  const max = actionRequired?.max_raise ?? 0;

  const [preAction, setPreAction] = usePreAction();

  useEffect(() => {
    if (actionRequired) setRaiseAmount(actionRequired.min_raise);
  }, [actionRequired]);

  // Fire a queued pre-action the moment it becomes the hero's turn, then clear.
  useEffect(() => {
    if (!isMyTurn || !actionRequired || preAction === "none") return;
    const va = actionRequired.valid_actions;
    const canCheckNow = va.includes("check");
    const canCallNow = va.includes("call");
    let act: [string, number] | null = null;
    if (preAction === "fold") act = ["fold", 0];
    else if (preAction === "check_fold") act = canCheckNow ? ["check", 0] : ["fold", 0];
    else if (preAction === "call_any") act = canCallNow ? ["call", 0] : canCheckNow ? ["check", 0] : null;
    setPreAction("none");
    if (act) void sendAction(act[0], act[1]);
  }, [isMyTurn, actionRequired, preAction, sendAction, setPreAction]);

  const setClamped = useCallback(
    (value: number) => setRaiseAmount(clampToBounds(value, min, max)),
    [min, max],
  );

  // Pot-fraction raise-to amounts, derived from the pot / to-call the server sent.
  // A fraction f raises "to": (amount needed to match) + f × (pot after we call).
  const presets = useMemo(() => {
    const currentBet = snapshot?.current_bet ?? toCall;
    const potAfterCall = pot + toCall;
    const raiseTo = (fraction: number) =>
      clampToBounds(currentBet + fraction * potAfterCall, min, max);
    return {
      half: raiseTo(0.5),
      twoThird: raiseTo(2 / 3),
      pot: raiseTo(1),
    };
  }, [snapshot?.current_bet, toCall, pot, min, max]);

  if (!isMyTurn || !actionRequired) return null;

  const canCheck = actionRequired.valid_actions.includes("check");
  const canCall = actionRequired.valid_actions.includes("call");
  const canRaise = actionRequired.valid_actions.includes("raise");

  const presetButtons: Array<{ key: string; label: string; amount: number }> = [
    { key: "min", label: "Min", amount: min },
    { key: "half", label: "½ Pot", amount: presets.half },
    { key: "twoThird", label: "⅔ Pot", amount: presets.twoThird },
    { key: "pot", label: "Pot", amount: presets.pot },
    { key: "allIn", label: "All-In", amount: max },
  ];

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/[0.06] bg-surface p-4 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <p className="text-xs uppercase tracking-[0.25em] text-muted">Your Action</p>
      <p className="mt-1 text-sm text-neutral-300">
        Pot {formatCents(pot)} · To call {formatCents(actionRequired.to_call)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sendAction("fold", 0)}
          className="rounded-xl border border-brand/50 bg-brand/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-[#ff9ba1] hover:bg-brand/25"
        >
          Fold
        </button>
        {canCheck && (
          <button
            type="button"
            onClick={() => void sendAction("check", 0)}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-neutral-200 hover:bg-white/10"
          >
            Check
          </button>
        )}
        {canCall && (
          <button
            type="button"
            onClick={() => void sendAction("call", 0)}
            className="rounded-xl border border-green/50 bg-green/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-[#bff5d3] hover:bg-green/25"
          >
            Call {formatCents(actionRequired.to_call)}
          </button>
        )}
        {canRaise && (
          <button
            type="button"
            onClick={() => void sendAction("raise", raiseAmount)}
            className="rounded-xl border border-gold/50 bg-gold/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-gold hover:bg-gold/25"
          >
            Raise {formatCents(raiseAmount)}
          </button>
        )}
      </div>

      {canRaise && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{formatCents(min)}</span>
            <span className="font-semibold text-gold">{formatCents(raiseAmount)}</span>
            <span>{formatCents(max)}</span>
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={100}
            value={raiseAmount}
            onChange={(e) => setClamped(Number(e.target.value))}
            className="mt-2 w-full accent-[#f5c518]"
          />

          <div className="mt-3 flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-neutral-500" htmlFor="raise-amount">
              Amount
            </label>
            <div className="flex items-center rounded-lg border border-white/10 bg-black/40 px-2">
              <span className="text-xs text-neutral-500">$</span>
              <input
                id="raise-amount"
                type="number"
                inputMode="numeric"
                min={min / 100}
                max={max / 100}
                step={1}
                value={Math.round(raiseAmount / 100)}
                onChange={(e) => setClamped(Number(e.target.value) * 100)}
                className="w-20 bg-transparent px-1 py-1 text-sm text-gold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {presetButtons.map(({ key, label, amount }) => {
              const active = raiseAmount === amount;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClamped(amount)}
                  className={`rounded-lg border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                    active
                      ? "border-brand/60 bg-brand/15 text-white"
                      : "border-white/10 text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

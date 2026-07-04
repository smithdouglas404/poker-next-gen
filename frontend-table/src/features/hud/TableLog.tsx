"use client";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MAX_BUY_IN_CENTS, MIN_BUY_IN_CENTS } from "@/features/game/protocol";

export function TableLog() {
  const { gameLog, snapshot, showdown } = useGame();

  return (
    <aside className="pointer-events-auto flex max-h-64 w-full max-w-xs flex-col rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Table Log</p>
        {snapshot && (
          <p className="mt-1 text-sm text-white">
            Pot {formatCents(snapshot.pot)} · {snapshot.phase}
          </p>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        {showdown?.winners && showdown.winners.length > 0 && (
          <li className="mb-2 rounded-lg bg-emerald-950/40 px-2 py-1.5 text-emerald-200">
            Winner: {showdown.winners.map((w) => w.username ?? `Seat ${w.seat + 1}`).join(", ")}
          </li>
        )}
        {gameLog.length === 0 && <li className="text-neutral-500">Waiting for table events…</li>}
        {gameLog.map((entry) => (
          <li
            key={entry.id}
            className={`mb-1.5 rounded px-2 py-1 ${
              entry.level === "error"
                ? "text-red-300"
                : entry.level === "action"
                  ? "text-sky-200"
                  : entry.level === "pot"
                    ? "text-amber-200"
                    : "text-neutral-400"
            }`}
          >
            {entry.message}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function BuyInSlider() {
  const { buyInCents, setBuyInCents, profile } = useGame();
  const maxAllowed = Math.min(MAX_BUY_IN_CENTS, profile.walletCents);

  return (
    <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Buy-in amount</p>
      <p className="text-sm font-semibold text-emerald-300">{formatCents(buyInCents)}</p>
      <input
        type="range"
        min={MIN_BUY_IN_CENTS}
        max={maxAllowed}
        step={100}
        value={Math.min(buyInCents, maxAllowed)}
        onChange={(e) => setBuyInCents(Number(e.target.value))}
        className="mt-2 w-full accent-emerald-500"
      />
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        <span>{formatCents(MIN_BUY_IN_CENTS)} min</span>
        <span>{formatCents(maxAllowed)} max</span>
      </div>
    </div>
  );
}

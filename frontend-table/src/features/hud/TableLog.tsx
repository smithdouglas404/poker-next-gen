"use client";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MAX_BUY_IN_CENTS, MIN_BUY_IN_CENTS } from "@/features/game/protocol";

export function TableLog() {
  const { gameLog, snapshot, showdown } = useGame();

  return (
    <aside className="pointer-events-auto flex max-h-64 w-full max-w-xs flex-col rounded-2xl border border-white/[0.06] bg-surface shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Table Log</p>
        {snapshot && (
          <p className="mt-1 text-sm text-white">
            Pot {formatCents(snapshot.pot)} · {snapshot.phase}
          </p>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        {showdown?.winners && showdown.winners.length > 0 && (
          <li className="mb-2 rounded-lg bg-green/10 px-2 py-1.5 text-[#bff5d3]">
            Winner: {showdown.winners.map((w) => w.username ?? `Seat ${w.seat + 1}`).join(", ")}
          </li>
        )}
        {gameLog.length === 0 && <li className="text-neutral-500">Waiting for table events…</li>}
        {gameLog.map((entry) => (
          <li
            key={entry.id}
            className={`mb-1.5 rounded px-2 py-1 ${
              entry.level === "error"
                ? "text-[#ff9ba1]"
                : entry.level === "action"
                  ? "text-neutral-200"
                  : entry.level === "pot"
                    ? "text-gold"
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
    <div className="pointer-events-auto rounded-xl border border-white/[0.06] bg-surface p-3 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <p className="text-[10px] uppercase tracking-wider text-muted">Buy-in amount</p>
      <p className="text-sm font-semibold text-green">{formatCents(buyInCents)}</p>
      <input
        type="range"
        min={MIN_BUY_IN_CENTS}
        max={maxAllowed}
        step={100}
        value={Math.min(buyInCents, maxAllowed)}
        onChange={(e) => setBuyInCents(Number(e.target.value))}
        className="mt-2 w-full accent-[#22c55e]"
      />
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        <span>{formatCents(MIN_BUY_IN_CENTS)} min</span>
        <span>{formatCents(maxAllowed)} max</span>
      </div>
    </div>
  );
}

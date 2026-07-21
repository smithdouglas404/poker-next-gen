"use client";

import { TAUNTS } from "./library";
import { useGame } from "@/features/game/GameProvider";

/** Quick voice-taunt bar. Clicking broadcasts the taunt to the whole table
 *  (over the chat channel) so everyone hears the sender's character voice. */
export function TauntBar() {
  const { sendTaunt, matchId } = useGame();
  if (!matchId) return null;

  return (
    <div className="pointer-events-auto flex w-full max-w-xs flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-black/60 p-2 backdrop-blur-md">
      {TAUNTS.map((t) => (
        <button
          key={t.key}
          type="button"
          title={t.label}
          onClick={() => void sendTaunt(t.key)}
          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-200 transition hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-100"
        >
          <span className="mr-1">{t.emoji}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

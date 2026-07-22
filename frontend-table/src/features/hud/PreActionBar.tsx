"use client";

import { useGame } from "@/features/game/GameProvider";
import { togglePreAction, usePreAction } from "@/features/hud/preAction";

const OPTS = [
  { key: "check_fold", label: "Check/Fold" },
  { key: "call_any", label: "Call Any" },
  { key: "fold", label: "Fold" },
] as const;

/** Pre-action toggles shown while the hero is in a hand but it isn't their turn. */
export function PreActionBar() {
  const { snapshot, profile, actionRequired } = useGame();
  const [pre] = usePreAction();

  const hero = snapshot?.seats.find((s) => s.user_id === profile.userId);
  if (!hero) return null;

  const status = (hero.status ?? "").toLowerCase();
  const inHand = status === "seated" || status === "all_in";
  const activeHand = ["preflop", "flop", "turn", "river"].includes(snapshot?.phase ?? "waiting");
  const isMyTurn = actionRequired?.seat === hero.index;
  if (!inHand || !activeHand || isMyTurn) return null;

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.06] bg-surface px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <span className="text-[10px] uppercase tracking-wider text-muted">Pre-action</span>
      {OPTS.map((o) => {
        const active = pre === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => togglePreAction(o.key)}
            className={`rounded-lg border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
              active
                ? "border-brand/60 bg-brand/15 text-white"
                : "border-white/10 text-neutral-300 hover:bg-white/5"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

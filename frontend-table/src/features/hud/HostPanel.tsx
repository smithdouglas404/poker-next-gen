"use client";

import { useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";

/** Live host controls — visible only to the table creator. Pause/resume dealing,
 *  kick a player, adjust blinds for future hands, or close the table. Every
 *  action is host-verified server-side. */
export function HostPanel() {
  const { snapshot, profile, hostAction } = useGame();
  const [sb, setSb] = useState<number>(0);
  const [bb, setBb] = useState<number>(0);

  if (!snapshot || !snapshot.host_user_id || snapshot.host_user_id !== profile.userId) return null;

  const paused = snapshot.host_paused;
  const others = snapshot.seats.filter(
    (s) => s.user_id && s.status !== "empty" && s.user_id !== profile.userId,
  );
  const curSb = Math.round((snapshot.small_blind ?? 0) / 100);
  const curBb = Math.round((snapshot.big_blind ?? 0) / 100);

  return (
    <aside className="pointer-events-auto flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-white/[0.06] bg-surface p-3 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Host Controls</p>
        {paused && (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase text-gold">
            Paused
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => void hostAction({ action: paused ? "resume" : "pause" })}
        className="rounded-lg border border-gold/40 bg-gold/10 px-2 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20"
      >
        {paused ? "▶ Resume dealing" : "❚❚ Pause dealing"}
      </button>

      <div className="flex items-end gap-1.5">
        <label className="flex flex-1 flex-col text-[9px] uppercase tracking-wider text-neutral-500">
          SB $
          <input
            type="number"
            min={1}
            defaultValue={curSb}
            onChange={(e) => setSb(Number(e.target.value) * 100)}
            className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-1 py-1 text-xs text-white"
          />
        </label>
        <label className="flex flex-1 flex-col text-[9px] uppercase tracking-wider text-neutral-500">
          BB $
          <input
            type="number"
            min={1}
            defaultValue={curBb}
            onChange={(e) => setBb(Number(e.target.value) * 100)}
            className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-1 py-1 text-xs text-white"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            void hostAction({
              action: "set_blinds",
              small_blind: sb || snapshot.small_blind,
              big_blind: bb || snapshot.big_blind,
            })
          }
          className="rounded-lg bg-brand px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#ff2d3f]"
        >
          Set
        </button>
      </div>

      {others.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">Remove player</span>
          {others.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => void hostAction({ action: "kick", seat: s.index })}
              className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1 text-[11px] text-neutral-200 hover:border-red-500/40 hover:text-red-200"
            >
              <span className="truncate">{s.username ?? `Seat ${s.index + 1}`}</span>
              <span className="text-[10px] text-neutral-500">{formatCents(s.stack)} · kick</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void hostAction({ action: "close" })}
        className="mt-1 rounded-lg border border-red-500/40 bg-red-950/30 px-2 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/40"
      >
        Close table (refund all)
      </button>
    </aside>
  );
}

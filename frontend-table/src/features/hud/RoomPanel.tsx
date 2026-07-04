"use client";

import { useState } from "react";

import { useGame } from "@/features/game/GameProvider";

export function RoomPanel() {
  const { createRoom, joinRoom, matchId, startHand, snapshot, findMatch } = useGame();
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);

  const seated = snapshot?.seats.filter((s) => s.status !== "empty").length ?? 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Room Control</p>
      <h2 className="mt-1 text-lg font-semibold text-white">Create / Join</h2>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => createRoom())}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Create Room
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => findMatch())}
          className="rounded-xl border border-sky-400/40 bg-sky-950/40 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-900/40 disabled:opacity-50"
        >
          Find Match
        </button>

        <div className="flex gap-2">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Match ID"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
          />
          <button
            type="button"
            disabled={busy || !joinId.trim()}
            onClick={() => run(() => joinRoom(joinId.trim()))}
            className="rounded-xl border border-amber-400/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
          >
            Join
          </button>
        </div>

        {matchId && (
          <button
            type="button"
            disabled={busy || seated < 2}
            onClick={() => run(() => startHand())}
            className="rounded-xl border border-violet-400/40 bg-violet-950/40 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-violet-200 hover:bg-violet-900/40 disabled:opacity-50"
          >
            Start Hand ({seated}/6 seated)
          </button>
        )}
      </div>

      {matchId && (
        <p className="mt-3 break-all font-mono text-[10px] text-neutral-500">Match: {matchId}</p>
      )}
    </aside>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MAX_BUY_IN_CENTS, MIN_BUY_IN_CENTS } from "@/features/game/protocol";

export function RoomPanel() {
  const {
    createRoom,
    joinRoom,
    matchId,
    startHand,
    snapshot,
    findMatch,
    standUp,
    listTables,
    openTables,
    matchmakerSearching,
    buyInCents,
    connected,
  } = useGame();
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);

  const seated = snapshot?.seats.filter((s) => s.status !== "empty").length ?? 0;
  const heroSeated = snapshot?.seats.some((s) => s.is_hero && s.status !== "empty") ?? false;

  useEffect(() => {
    if (connected) void listTables();
  }, [connected, listTables]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Room Control</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Create / Join</h2>
        </div>
        <Link
          href="/lobby"
          className="rounded-lg border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-950/40"
        >
          Lobby
        </Link>
      </div>

      <p className="mt-2 text-[10px] text-neutral-500">
        Buy-in {formatCents(MIN_BUY_IN_CENTS)}–{formatCents(MAX_BUY_IN_CENTS)} · selected{" "}
        {formatCents(buyInCents)}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => createRoom({ buyIn: buyInCents }))}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Create Room
        </button>

        <button
          type="button"
          disabled={busy || matchmakerSearching}
          onClick={() => run(() => findMatch())}
          className="rounded-xl border border-sky-400/40 bg-sky-950/40 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-900/40 disabled:opacity-50"
        >
          {matchmakerSearching ? "Searching…" : "Find Match"}
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
          <>
            <button
              type="button"
              disabled={busy || seated < 2}
              onClick={() => run(() => startHand())}
              className="rounded-xl border border-violet-400/40 bg-violet-950/40 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-violet-200 hover:bg-violet-900/40 disabled:opacity-50"
            >
              Start Hand ({seated}/6 seated)
            </button>
            {heroSeated && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => standUp())}
                className="rounded-xl border border-red-400/40 bg-red-950/30 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-red-200 hover:bg-red-900/30 disabled:opacity-50"
              >
                Stand Up
              </button>
            )}
          </>
        )}
      </div>

      {openTables.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Open tables</p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {openTables.slice(0, 5).map((t) => (
              <li key={t.match_id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => joinRoom(t.match_id))}
                  className="w-full truncate rounded-lg px-2 py-1 text-left text-[11px] text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {t.room_id ?? t.label ?? t.match_id.slice(0, 8)}
                  {t.seated !== undefined ? ` · ${t.seated}/6` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {matchId && (
        <p className="mt-3 break-all font-mono text-[10px] text-neutral-500">Match: {matchId}</p>
      )}
    </aside>
  );
}

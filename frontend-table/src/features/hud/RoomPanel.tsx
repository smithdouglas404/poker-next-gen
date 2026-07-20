"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import {
  DEFAULT_BIG_BLIND_CENTS,
  DEFAULT_SMALL_BLIND_CENTS,
  MAX_BUY_IN_CENTS,
  MAX_SEATS,
  MIN_BUY_IN_CENTS,
  MIN_SEATS,
} from "@/features/game/protocol";

const OPEN_STORAGE_KEY = "pkr:roomPanelOpen";

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
    maxSeats,
    connected,
  } = useGame();
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  // Create-table parameters (blinds in cents, consistent with the buy-in).
  const [smallBlind, setSmallBlind] = useState(DEFAULT_SMALL_BLIND_CENTS);
  const [bigBlind, setBigBlind] = useState(DEFAULT_BIG_BLIND_CENTS);
  const [seats, setSeats] = useState(maxSeats);

  const seatCap = snapshot?.max_seats ?? snapshot?.seats.length ?? maxSeats;
  const seated = snapshot?.seats.filter((s) => s.status !== "empty").length ?? 0;
  const heroSeated = snapshot?.seats.some((s) => s.is_hero && s.status !== "empty") ?? false;

  const blindsValid = smallBlind >= 1 && bigBlind >= smallBlind;
  const seatsValid = seats >= MIN_SEATS && seats <= MAX_SEATS;
  const createValid = blindsValid && seatsValid;

  // Restore drawer state from localStorage on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
      if (stored !== null) setOpen(stored === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

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
    <div className="pointer-events-none fixed left-0 top-20 z-40 flex items-start">
      <aside
        className={`pointer-events-auto max-h-[calc(100vh-6rem)] w-72 overflow-y-auto rounded-r-2xl border border-l-0 border-white/10 bg-black/70 p-4 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
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

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">New table setup</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Small Blind
              </span>
              <input
                type="number"
                min={1}
                value={smallBlind}
                onChange={(e) => setSmallBlind(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
              />
              <span className="text-[9px] text-neutral-500">{formatCents(smallBlind)}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Big Blind
              </span>
              <input
                type="number"
                min={1}
                value={bigBlind}
                onChange={(e) => setBigBlind(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className={`w-full rounded-lg border bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50 ${
                  blindsValid ? "border-white/10" : "border-red-500/60"
                }`}
              />
              <span className="text-[9px] text-neutral-500">{formatCents(bigBlind)}</span>
            </label>
          </div>

          <label className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Max Seats ({MIN_SEATS}–{MAX_SEATS})
            </span>
            <input
              type="number"
              min={MIN_SEATS}
              max={MAX_SEATS}
              value={seats}
              onChange={(e) =>
                setSeats(
                  Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(Number(e.target.value) || MIN_SEATS))),
                )
              }
              className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-center text-xs text-white outline-none focus:border-emerald-500/50"
            />
          </label>

          {!blindsValid && (
            <p className="mt-2 text-[10px] text-red-300">Big blind must be ≥ small blind.</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !createValid}
            onClick={() =>
              run(() =>
                createRoom({
                  buyIn: buyInCents,
                  smallBlind,
                  bigBlind,
                  maxSeats: seats,
                }),
              )
            }
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
                Start Hand ({seated}/{seatCap} seated)
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
                    {t.seated !== undefined ? ` · ${t.seated} seated` : ""}
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

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close room control" : "Open room control"}
        className="pointer-events-auto mt-2 flex items-center gap-1 rounded-r-xl border border-l-0 border-emerald-500/40 bg-black/70 px-2 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-200 shadow-lg backdrop-blur-md transition hover:bg-emerald-950/60 [writing-mode:vertical-rl]"
      >
        <span className="rotate-180">⚙ Room</span>
      </button>
    </div>
  );
}

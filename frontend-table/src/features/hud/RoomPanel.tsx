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
import { Button, Input, SectionHeader, cn } from "@/features/ui";
import { getTableGraphics } from "@/features/table/tableGraphics";

const OPEN_STORAGE_KEY = "pkr:roomPanelOpen";

export function RoomPanel() {
  const {
    createRoom,
    joinRoom,
    joinByCode,
    roomCode,
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
    addBot,
    setPreviewSeats,
  } = useGame();
  const [joinId, setJoinId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Cinematic is the default look and the felt must stay clear, so the Room
  // Control drawer starts collapsed there (reachable via the ⚙ Room tab). In
  // classic mode it stays open as before. A stored preference still wins.
  const [open, setOpen] = useState(() => getTableGraphics() !== "cinematic");

  // Create-table parameters (blinds in cents, consistent with the buy-in).
  const [smallBlind, setSmallBlind] = useState(DEFAULT_SMALL_BLIND_CENTS);
  const [bigBlind, setBigBlind] = useState(DEFAULT_BIG_BLIND_CENTS);
  const [seats, setSeats] = useState(maxSeats);
  const [gameVariant, setGameVariant] = useState<"holdem" | "plo">("holdem");
  const [durationMins, setDurationMins] = useState(0); // 0 = unlimited

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
        className={cn(
          "pointer-events-auto max-h-[calc(100vh-6rem)] w-72 overflow-y-auto rounded-r-2xl border border-l-0 border-white/[0.06] bg-surface p-4 shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <SectionHeader>Room Control</SectionHeader>
            <h2 className="font-display mt-1 text-lg font-bold text-white">Create / Join</h2>
          </div>
          <Link
            href="/lobby"
            className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted hover:bg-white/5 hover:text-foreground"
          >
            Lobby
          </Link>
        </div>

        <p className="mt-2 text-[10px] text-neutral-500">
          Buy-in {formatCents(MIN_BUY_IN_CENTS)}–{formatCents(MAX_BUY_IN_CENTS)} · selected{" "}
          <span className="text-gold">{formatCents(buyInCents)}</span>
        </p>

        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            New table setup
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Small Blind</span>
              <Input
                type="number"
                min={1}
                value={smallBlind}
                onChange={(e) => setSmallBlind(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className="px-2 py-1.5 text-xs"
              />
              <span className="text-[9px] text-neutral-500">{formatCents(smallBlind)}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Big Blind</span>
              <Input
                type="number"
                min={1}
                value={bigBlind}
                onChange={(e) => setBigBlind(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className={cn("px-2 py-1.5 text-xs", !blindsValid && "border-red-500/60")}
              />
              <span className="text-[9px] text-neutral-500">{formatCents(bigBlind)}</span>
            </label>
          </div>

          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Game</span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {(
                [
                  { key: "holdem", label: "Hold'em", hint: "No-Limit · 2 cards" },
                  { key: "plo", label: "Omaha", hint: "Pot-Limit · 4 cards" },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setGameVariant(v.key)}
                  className={`flex flex-col items-start rounded-lg border px-2 py-1 text-left transition ${
                    gameVariant === v.key
                      ? "border-brand/60 bg-brand/15 text-white"
                      : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25"
                  }`}
                >
                  <span className="text-xs font-semibold">{v.label}</span>
                  <span className="text-[9px] text-neutral-500">{v.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Max Seats ({MIN_SEATS}–{MAX_SEATS})
            </span>
            <Input
              type="number"
              min={MIN_SEATS}
              max={MAX_SEATS}
              value={seats}
              onChange={(e) => {
                const n = Math.min(
                  MAX_SEATS,
                  Math.max(MIN_SEATS, Math.round(Number(e.target.value) || MIN_SEATS)),
                );
                setSeats(n);
                setPreviewSeats(n); // live-update the seat ring before Create
              }}
              className="w-16 px-2 py-1.5 text-center text-xs"
            />
          </label>

          <div className="mt-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Duration (auto-closes · no host needed)
            </span>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {(
                [
                  { mins: 0, label: "∞" },
                  { mins: 30, label: "30m" },
                  { mins: 60, label: "1h" },
                  { mins: 120, label: "2h" },
                ] as const
              ).map((d) => (
                <button
                  key={d.mins}
                  type="button"
                  onClick={() => setDurationMins(d.mins)}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                    durationMins === d.mins
                      ? "border-brand/60 bg-brand/15 text-white"
                      : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {!blindsValid && (
            <p className="mt-2 text-[10px] text-[#ff9ba1]">Big blind must be ≥ small blind.</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            disabled={busy || !createValid}
            onClick={() =>
              run(() =>
                createRoom({
                  buyIn: buyInCents,
                  smallBlind,
                  bigBlind,
                  maxSeats: seats,
                  variant: gameVariant,
                  durationMins,
                }),
              )
            }
            className="w-full"
          >
            Create Room
          </Button>

          <Button
            variant="outline"
            disabled={busy || matchmakerSearching}
            onClick={() => run(() => findMatch())}
            className="w-full border-white/20 text-neutral-200 hover:bg-white/5"
          >
            {matchmakerSearching ? "Searching…" : "Find Match"}
          </Button>

          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code (e.g. K7M2QD)"
              maxLength={6}
              className="min-w-0 flex-1 px-3 py-2 text-xs uppercase tracking-widest"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || joinCode.trim().length < 4}
              onClick={() => run(() => joinByCode(joinCode.trim()))}
              className="border-white/20 text-neutral-200 hover:bg-white/5"
            >
              Join Code
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="Match ID"
              className="min-w-0 flex-1 px-3 py-2 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !joinId.trim()}
              onClick={() => run(() => joinRoom(joinId.trim()))}
              className="border-white/20 text-neutral-200 hover:bg-white/5"
            >
              Join
            </Button>
          </div>

          {matchId && roomCode && (
            <button
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/lobby?code=${roomCode}`;
                void navigator.clipboard?.writeText(link);
              }}
              title="Copy invite link"
              className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-left"
            >
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">Share code</span>
              <span className="font-mono text-sm font-bold tracking-[0.3em] text-gold">
                {roomCode}
              </span>
              <span className="text-[10px] text-gold/80">copy link</span>
            </button>
          )}

          {matchId && (
            <>
              <Button
                variant="outline"
                disabled={busy || seated < 2}
                onClick={() => run(() => startHand())}
                className="w-full border-green/40 text-[#bff5d3] hover:bg-green/10"
              >
                Start Hand ({seated}/{seatCap} seated)
              </Button>
              <Button
                variant="outline"
                disabled={busy || seated >= seatCap}
                onClick={() => run(() => addBot())}
                className="w-full border-white/20 text-neutral-200 hover:bg-white/5"
              >
                + Add Bot
              </Button>
              {heroSeated && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => run(() => standUp())}
                  className="w-full"
                >
                  Stand Up
                </Button>
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
        className="pointer-events-auto mt-2 flex items-center gap-1 rounded-r-xl border border-l-0 border-white/[0.08] bg-surface px-2 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted shadow-lg transition hover:bg-white/5 hover:text-foreground [writing-mode:vertical-rl]"
      >
        <span className="rotate-180">⚙ Room</span>
      </button>
    </div>
  );
}

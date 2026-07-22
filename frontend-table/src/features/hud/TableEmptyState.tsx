"use client";

import { useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Empty-table path to the money action (UI review P0-7). The felt looked great
// but had nothing to do on it — no seats, no "take a seat", no way in. This
// overlay gives the empty table a clear path: practice vs. join by code, and a
// buy-in that defaults to the table's minimum (not the max, which read as the
// house nudging players to over-deposit).

export function TableEmptyState() {
  const { snapshot, matchId, createRoom, joinByCode, sitDown, profile, buyInCents } = useGame();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seated = (snapshot?.seats ?? []).filter(
    (s) => (s.status ?? "") !== "" && (s.status ?? "") !== "empty",
  ).length;
  const iAmSeated = (snapshot?.seats ?? []).some((s) => s.user_id === profile.userId);

  // Once the player is seated, the scene takes over — hide the overlay.
  if (iAmSeated) return null;

  const maxSeats = snapshot?.max_seats ?? 6;

  // The first seat not held by another player/bot — the hero's open chair.
  function firstOpenSeat(): number {
    const taken = new Set(
      (snapshot?.seats ?? [])
        .filter((s) => (s.status ?? "") !== "" && (s.status ?? "") !== "empty")
        .map((s) => s.index),
    );
    for (let i = 0; i < maxSeats; i++) if (!taken.has(i)) return i;
    return 0;
  }

  async function practice() {
    setBusy(true);
    setErr(null);
    try {
      // A practice table: 5 bots + the hero. createRoom auto-joins; the bots
      // fill their seats, then the overlay flips to "take seat" for the hero's
      // open chair (below). Leaving the actual sit to the button avoids racing
      // the first snapshot.
      await createRoom({ numBots: 5, maxSeats: 6 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start a table.");
    } finally {
      setBusy(false);
    }
  }

  async function takeSeat() {
    setBusy(true);
    setErr(null);
    try {
      await sitDown(firstOpenSeat());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not take a seat.");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await joinByCode(code.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not join that table.");
    } finally {
      setBusy(false);
    }
  }

  const gold =
    "rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className={cn(GLASS_PANEL, "pointer-events-auto w-full max-w-md p-6 text-center")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">
          {matchId ? "Waiting for players" : "Take a seat"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {matchId ? `${seated} of ${maxSeats} seated` : "This table is open"}
        </h2>
        <p className="mt-2 text-sm text-neutral-300">
          {matchId
            ? "Add bots to practice now, or invite friends by code."
            : "Practice against bots, or join a friend's table by code."}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {matchId ? (
            <button type="button" disabled={busy} onClick={takeSeat} className={gold}>
              Take seat · buy-in {formatCents(buyInCents)}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={practice} className={gold}>
              Add bots &amp; deal me in
            </button>
          )}

          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Table code"
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/50"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={join}
              className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:bg-white/5 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
}

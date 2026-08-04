"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { BuyInDialog } from "@/features/hud/BuyInDialog";

// Empty-table path to the money action (UI review P0-7). The felt looked great
// but had nothing to do on it — no seats, no "take a seat", no way in. This
// overlay gives the empty table a clear path: take the open seat, or join a
// friend's table by code, with a buy-in defaulting to the table's minimum (not
// the max, which read as the house nudging players to over-deposit).
//
// It does NOT create a table. There was an "Add bots & deal me in" button here
// calling createRoom({numBots:5}) — creating a game from the felt, which the
// owner has ruled out repeatedly: you may LAND on a table to watch, join by
// code, or sit if allowed, never to create one. Creating is /lobby's job (four
// modes, where the who-may-host rules are actually applied) and /tournaments'.
// See CLAUDE.md > "Landing page — never a place to play" for the screen map.

export function TableEmptyState() {
  const { snapshot, matchId, joinByCode, profile, buyInCents } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);

  const seated = (snapshot?.seats ?? []).filter(
    (s) => (s.status ?? "") !== "" && (s.status ?? "") !== "empty",
  ).length;
  const iAmSeated = (snapshot?.seats ?? []).some((s) => s.user_id === profile.userId);

  // Once the player is seated, the scene takes over — hide the overlay. In
  // ?demo=1 there's no real matchId/socket for this component to detect that
  // seating, so it's suppressed outright — the demo felt is already fully
  // populated (DEMO_SNAPSHOT), there is nothing for this "take a seat" path
  // to offer.
  if (iAmSeated || demo) return null;

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

  // Seating goes through the buy-in dialog so the player picks wallet + amount
  // (P0-7 / WALLET-2) — never a silent sit at some default stack.
  function takeSeat() {
    setErr(null);
    setBuyInSeat(firstOpenSeat());
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
            ? "Invite friends by code, or take an open seat."
            : "Enter a table code to join a game."}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {/* Only rendered with a live match — sitting at a table that exists.
              There is deliberately no create/start control here. */}
          {matchId && (
            <button type="button" disabled={busy} onClick={takeSeat} className={gold}>
              Take seat · buy-in {formatCents(buyInCents)}
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

      {buyInSeat !== null && (
        <BuyInDialog seat={buyInSeat} onClose={() => setBuyInSeat(null)} />
      )}
    </div>
  );
}

"use client";

import Link from "next/link";

import { useGame } from "@/features/game/GameProvider";

// Railbird banner. The backend already lets a non-seated presence watch (public
// snapshots, no hole cards until showdown) and post to the rail chat, and the
// seat-action UI (ActionBar/PreActionBar) already hides itself for a seatless
// player. This just makes the "you're watching" state legible and tells the
// railbird how to join. Renders only while connected to a table with no seat.
export function SpectatorBar() {
  const { connected, snapshot, profile } = useGame();

  const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
  if (!connected || !snapshot || heroSeat >= 0) return null;

  const openSeats = snapshot.seats.filter((s) => !s.user_id).length;

  return (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-gold/30 bg-surface/90 px-4 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
          👁 Railbird
        </span>
        <span className="text-xs text-muted">
          {openSeats > 0
            ? "You're watching — click an open seat to join the action."
            : "You're watching. Table is full; a seat will open up."}
        </span>
        <Link
          href="/lobby"
          className="text-[11px] font-semibold text-neutral-400 hover:text-white"
        >
          Leave rail
        </Link>
      </div>
    </div>
  );
}

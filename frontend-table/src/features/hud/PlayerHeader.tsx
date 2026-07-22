"use client";

import Link from "next/link";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MuteToggle } from "@/features/sound/MuteToggle";

export function PlayerHeader() {
  const { profile, matchId, roomId, connected } = useGame();

  return (
    <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-surface px-5 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] text-lg font-bold text-[#231b00]">
          {profile.username.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{profile.username}</p>
          <p className="text-xs text-neutral-400">Player ID · {profile.userId.slice(0, 8) || "…"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted">Wallet</p>
          <p className="text-lg font-semibold text-green">{formatCents(profile.walletCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted">Room</p>
          <p className="font-mono text-sm text-gold">{roomId ?? matchId?.slice(0, 8) ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-green" : "bg-brand"}`}
          />
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <MuteToggle />
        <Link href="/lobby" className="text-xs uppercase tracking-wider text-muted hover:text-foreground">
          Lobby
        </Link>
        <Link href="/hub" className="text-xs uppercase tracking-wider text-muted hover:text-foreground">
          Command Center
        </Link>
      </div>
    </header>
  );
}

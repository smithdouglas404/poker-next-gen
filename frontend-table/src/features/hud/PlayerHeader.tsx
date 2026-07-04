"use client";

import Link from "next/link";

import { formatCents, useGame } from "@/features/game/GameProvider";

export function PlayerHeader() {
  const { profile, matchId, roomId, connected } = useGame();

  return (
    <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/55 px-5 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-lg font-bold text-black">
          {profile.username.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{profile.username}</p>
          <p className="text-xs text-neutral-400">Player ID · {profile.userId.slice(0, 8) || "…"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Wallet</p>
          <p className="text-lg font-semibold text-emerald-300">{formatCents(profile.walletCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Room</p>
          <p className="font-mono text-sm text-amber-200">{roomId ?? matchId?.slice(0, 8) ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
          />
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      <Link href="/" className="text-xs uppercase tracking-wider text-emerald-300/80 hover:text-emerald-200">
        Command Center
      </Link>
    </header>
  );
}

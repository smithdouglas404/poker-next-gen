"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MuteToggle } from "@/features/sound/MuteToggle";
import { clearAuth } from "@/lib/nakama/auth";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Consolidated player profile menu (previously the hero's account actions were
// scattered as loose links and there was no sign-out at all). One dropdown:
// wallet, account/security, navigation, and Sign out.
export function PlayerHeader() {
  const { profile, matchId, roomId, connected } = useGame();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const copyId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(profile.userId);
    }
    setOpen(false);
  };

  const signOut = () => {
    clearAuth();
    if (typeof window !== "undefined") window.location.href = "/";
  };

  const menuLink =
    "block rounded-lg px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.06] hover:text-white";

  return (
    <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-surface px-5 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-3 rounded-xl px-1 py-1 transition hover:bg-white/[0.04]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] text-lg font-bold text-[#231b00]">
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{profile.username}</p>
            <p className="text-xs text-neutral-400">Profile ▾</p>
          </div>
        </button>

        {open && (
          <div
            role="menu"
            className={cn(
              GLASS_PANEL,
              "absolute left-0 top-full z-50 mt-2 w-56 border-white/10 bg-surface-2 p-1.5 shadow-xl",
            )}
          >
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted">Wallet</p>
              <p className="text-base font-semibold text-green">{formatCents(profile.walletCents)}</p>
            </div>
            <div className="my-1 h-px bg-white/10" />
            <Link href="/wallet" className={menuLink} onClick={() => setOpen(false)}>
              💳 Wallet & deposits
            </Link>
            <Link href="/profile" className={menuLink} onClick={() => setOpen(false)}>
              👤 Account & security
            </Link>
            <Link href="/hub" className={menuLink} onClick={() => setOpen(false)}>
              🎛 Command Center
            </Link>
            <Link href="/command-core" className={menuLink} onClick={() => setOpen(false)}>
              🛰 Command Core (new session)
            </Link>
            <Link href="/cyber-deck" className={menuLink} onClick={() => setOpen(false)}>
              🛰 Cyber-Deck (operator console)
            </Link>
            <Link href="/lobby" className={menuLink} onClick={() => setOpen(false)}>
              🎲 Lobby
            </Link>
            <button type="button" onClick={copyId} className={cn(menuLink, "w-full text-left")}>
              🆔 Copy account ID
            </button>
            <div className="my-1 h-px bg-white/10" />
            <button
              type="button"
              onClick={signOut}
              className={cn(menuLink, "w-full text-left text-red-300 hover:text-red-200")}
            >
              ⎋ Sign out
            </button>
          </div>
        )}
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
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green" : "bg-brand"}`} />
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
        <MuteToggle />
      </div>
    </header>
  );
}

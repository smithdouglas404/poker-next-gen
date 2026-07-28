"use client";

// Tap an opponent's seat mid-hand -> see who they are. Backed by the SAME
// player_stats RPC the self profile page and the admin staff-profile tool
// already use (privacy-mode gated server-side — a player who has hidden their
// stats returns a 403 here too, handled as "private" rather than an error).
// No new backend surface: this is purely wiring an existing, intentionally
// opponent-safe RPC (its own doc comment calls out "the opponent HUD") to a
// seat click, which nothing did before.

import { useEffect, useState } from "react";

import { avatarSrc } from "@/features/table/avatars";
import { profileApi, type PlayerStats } from "@/features/profile/profileRpc";
import { OverlayAvatar, OverlayModal } from "./primitives";

export interface SeatProfileTarget {
  userId: string;
  username: string;
  avatar?: string;
  isBot?: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
    </div>
  );
}

export function SeatProfileCard({ target, onClose }: { target: SeatProfileTarget; onClose: () => void }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (target.isBot) {
      // Bots have no player_stats row (no account) — nothing to fetch.
      setLoading(false);
      return;
    }
    profileApi
      .stats(target.userId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this player's stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target.userId, target.isBot]);

  return (
    <OverlayModal title="Player" onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <OverlayAvatar src={avatarSrc(target.avatar ?? "neon-viper")} ring="#f3c14b" size={56} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">{target.username}</span>
              {target.isBot && (
                <span className="rounded-sm bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
                  Bot
                </span>
              )}
            </div>
          </div>
        </div>

        {target.isBot ? (
          <p className="mt-5 text-sm text-neutral-400">AI seat — no player statistics to show.</p>
        ) : loading ? (
          <p className="mt-5 text-sm text-neutral-400">Loading…</p>
        ) : error ? (
          <p className="mt-5 text-sm text-neutral-400">
            {error.toLowerCase().includes("private")
              ? "This player has kept their statistics private."
              : error}
          </p>
        ) : stats ? (
          stats.hands > 0 ? (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Stat label="Hands" value={String(stats.hands)} />
              <Stat label="Win rate" value={`${stats.win_rate_pct}%`} />
              <Stat label="VPIP" value={`${stats.vpip_pct}%`} />
              <Stat label="PFR" value={`${stats.pfr_pct}%`} />
              <Stat label="WTSD" value={`${stats.wtsd_pct}%`} />
              <Stat label="W$SD" value={`${stats.wsd_pct}%`} />
            </div>
          ) : (
            <p className="mt-5 text-sm text-neutral-400">No hands recorded yet.</p>
          )
        ) : null}
      </div>
    </OverlayModal>
  );
}

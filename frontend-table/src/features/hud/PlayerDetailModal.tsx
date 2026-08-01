"use client";

import { useEffect, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import type { Player } from "@/features/hrc/lib/poker-types";
import type { PlayerStats } from "@/features/profile/profileRpc";

// Click-a-seated-player detail popup. HRC's own reference (Game.tsx "PLAYER
// DETAIL REPORT MODAL") never had a Mute/Report/Add-friend menu — just
// session state + opponent stats, plus a host-only Kick button. There is no
// mute/report/friend RPC anywhere in this backend either, so this stays
// scoped to what's real: identity, live session state (already on the
// Player object, no RPC needed), and real stats via player_stats. Kicking is
// NOT duplicated here — HostPanel's own Player Management section already
// covers it for hosts/admins; this is the everyone-can-see-it stats view.
export function PlayerDetailModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await callSessionRpc("player_stats", { user_id: player.id });
        if (!cancelled) setStats(data as PlayerStats);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(GLASS_PANEL, "relative w-full max-w-sm overflow-hidden border-gold/25")} style={{ background: "#262d38" }}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-gold">Player</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {player.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.avatar} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/10 font-display text-lg font-bold text-white">
                {player.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-white">{player.name}</p>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">
                {player.isBot ? "Bot" : "Player"}
                {player.isDealer ? " · Dealer" : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-black/25 p-3 text-center">
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">Stack</p>
              <p className="font-display text-sm font-bold text-gold">${player.chips.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">Status</p>
              <p className="font-display text-sm font-bold capitalize text-white">{player.status}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">Bet</p>
              <p className="font-display text-sm font-bold text-white">${player.currentBet.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Stats</p>
            {loading && <p className="mt-2 text-xs text-neutral-500">Loading…</p>}
            {!loading && error && <p className="mt-2 text-xs text-neutral-500">{error}</p>}
            {!loading && !error && stats && (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                <StatLine label="Hands" value={stats.hands.toLocaleString()} />
                <StatLine label="Win Rate" value={`${Math.round(stats.win_rate_pct)}%`} />
                <StatLine label="VPIP" value={`${Math.round(stats.vpip_pct)}%`} />
                <StatLine label="PFR" value={`${Math.round(stats.pfr_pct)}%`} />
                <StatLine label="Biggest Pot" value={stats.biggest_pot_display ?? "—"} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="font-display text-xs font-bold text-white">{value}</span>
    </div>
  );
}

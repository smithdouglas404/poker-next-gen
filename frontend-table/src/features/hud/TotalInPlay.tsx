"use client";

import { useGame } from "@/features/game/GameProvider";
import { formatCents } from "@/features/game/GameProvider";

// Total money in play — the sum of every seat's chips (stack + committed bet)
// plus the pot. This is PUBLIC: all players see it, exactly like the pot. Each
// player's personal WALLET balance stays private — the server only ever sends a
// player their OWN wallet (hero_wallet_cents, per-recipient snapshot), so no
// wallet total is ever computed here. This reads only public table stacks.
export function TotalInPlay() {
  const { snapshot } = useGame();
  if (!snapshot) return null;

  const seated = (snapshot.seats ?? []).filter((s) => s.user_id);
  if (seated.length === 0) return null;

  const total =
    seated.reduce((sum, s) => sum + (s.stack ?? 0) + (s.bet ?? 0), 0) + (snapshot.pot ?? 0);

  return (
    <div className="pointer-events-none fixed left-1/2 top-[9%] z-30 -translate-x-1/2 rounded-xl border border-white/[0.06] bg-surface/70 px-3 py-1.5 text-center backdrop-blur-sm">
      <p className="text-[9px] uppercase tracking-[0.2em] text-muted">Total in play</p>
      <p className="font-display text-sm font-bold tabular-nums text-gold">{formatCents(total)}</p>
    </div>
  );
}

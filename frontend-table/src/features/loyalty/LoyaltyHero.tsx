"use client";

import { cn } from "@/features/ui/tokens";

import { NumberTicker } from "./NumberTicker";
import type { LoyaltyData } from "./loyaltyRpc";
import { Eyebrow, GoldHeading, ProgressBar, StatTile } from "./ui";

// Static catalog of loyalty levels — mirrors backend-core/loyalty.Levels. This is
// the level *definition* (design constant), not per-user state; the player's
// current level always comes from the server (`data.level`).
const LEVELS: { level: number; name: string; badge: string; hrp: number }[] = [
  { level: 1, name: "Rookie", badge: "🥉", hrp: 0 },
  { level: 2, name: "Regular", badge: "🥈", hrp: 500 },
  { level: 3, name: "Grinder", badge: "🥇", hrp: 2_000 },
  { level: 4, name: "Shark", badge: "🦈", hrp: 5_000 },
  { level: 5, name: "High Roller", badge: "💎", hrp: 15_000 },
  { level: 6, name: "VIP", badge: "♦️", hrp: 35_000 },
  { level: 7, name: "Elite", badge: "🔷", hrp: 75_000 },
  { level: 8, name: "Legend", badge: "🟢", hrp: 150_000 },
  { level: 9, name: "Icon", badge: "⚫", hrp: 300_000 },
  { level: 10, name: "Immortal", badge: "🌈", hrp: 500_000 },
];

export function LoyaltyHero({ data }: { data: LoyaltyData }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* Level + HRP hero */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] via-[#1c2128] to-[#1c2128] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl"
        />
        <div className="relative flex items-center gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-gold/30 bg-black/40 text-5xl shadow-[0_0_30px_rgba(245,197,24,0.25)]">
            {data.level.badge}
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>Level {data.level.level}</Eyebrow>
            <GoldHeading className="mt-1 text-3xl leading-tight">{data.level.name}</GoldHeading>
          </div>
          <div className="text-right">
            <NumberTicker
              value={data.hrp_total}
              className="block text-3xl font-bold tabular-nums text-gold"
            />
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              HRP earned
            </p>
          </div>
        </div>

        {data.next_level ? (
          <div className="relative mt-6">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-neutral-400">
              <span className="uppercase tracking-wider">
                {data.level.name} → <span className="text-gold">{data.next_level.name}</span>
              </span>
              <span className="tabular-nums">
                {data.hrp_total.toLocaleString()} /{" "}
                {data.next_level.hrp_required.toLocaleString()}
              </span>
            </div>
            <ProgressBar value={data.progress} tone="gold" />
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {Math.max(0, data.next_level.hrp_required - data.hrp_total).toLocaleString()} HRP to{" "}
              {data.next_level.name}
            </p>
          </div>
        ) : (
          <p className="relative mt-6 text-center text-sm font-semibold text-gold">
            🌈 Immortal — maximum loyalty reached
          </p>
        )}

        <div className="relative mt-5 grid grid-cols-3 gap-2.5">
          <StatTile label="Hands Played" value={data.hands_played.toLocaleString()} />
          <StatTile label="Hands Won" value={data.hands_won.toLocaleString()} accent="green" />
          <StatTile
            label={`${data.tier || "free"} tier`}
            value={`${data.multiplier}×`}
            accent="gold"
          />
        </div>
        <p className="relative mt-3 text-center text-[11px] text-neutral-500">
          HRP is earned by <span className="text-neutral-300">playing</span> — win or lose. Higher
          subscription tiers earn faster.
        </p>
      </div>

      {/* Level ladder */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#1c2128] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
        <Eyebrow tone="muted">Loyalty Ladder</Eyebrow>
        <div className="mt-3 space-y-1">
          {LEVELS.map((lvl) => {
            const isCurrent = lvl.level === data.level.level;
            const reached = data.hrp_total >= lvl.hrp;
            return (
              <div
                key={lvl.level}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-1.5 transition",
                  isCurrent
                    ? "border-gold/40 bg-gold/10 shadow-[0_0_18px_rgba(245,197,24,0.12)]"
                    : reached
                      ? "border-white/10 bg-white/[0.02]"
                      : "border-transparent opacity-45",
                )}
              >
                <span className="w-6 text-center text-lg">{lvl.badge}</span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      isCurrent ? "text-gold" : reached ? "text-neutral-200" : "text-neutral-500",
                    )}
                  >
                    {lvl.name}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
                  {lvl.hrp.toLocaleString()}
                </span>
                {isCurrent && (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.15em] text-gold">
                    You
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

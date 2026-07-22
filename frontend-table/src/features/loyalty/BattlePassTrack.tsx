"use client";

import { Button } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import type { BattlePassStatus } from "./loyaltyRpc";
import { money } from "./loyaltyRpc";
import { EmptyState, Eyebrow, GlassCard, GoldHeading, Pill, ProgressBar } from "./ui";

interface ClaimTarget {
  tier: number;
  track: "free" | "premium";
}

function TierNode({
  tier,
  freeCents,
  premiumCents,
  unlocked,
  claimedFree,
  claimedPremium,
  hasPremium,
  busy,
  onClaim,
}: {
  tier: number;
  freeCents: number;
  premiumCents: number;
  unlocked: boolean;
  claimedFree: boolean;
  claimedPremium: boolean;
  hasPremium: boolean;
  busy: ClaimTarget | null;
  onClaim: (t: ClaimTarget) => void;
}) {
  const cell = (
    track: "free" | "premium",
    cents: number,
    claimed: boolean,
    locked: boolean,
  ) => {
    const claimable = unlocked && !claimed && !locked;
    const isBusy = busy?.tier === tier && busy?.track === track;
    const gold = track === "premium";
    return (
      <button
        type="button"
        disabled={!claimable || isBusy}
        onClick={() => onClaim({ tier, track })}
        className={cn(
          "group flex w-full flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition disabled:cursor-not-allowed",
          claimed
            ? "border-emerald-500/30 bg-emerald-950/20"
            : claimable
              ? gold
                ? "border-gold/40 bg-gold/10 hover:shadow-[0_0_16px_rgba(245,197,24,0.25)]"
                : "border-green/40 bg-green/10 hover:shadow-[0_0_16px_rgba(34,197,94,0.2)]"
              : "border-white/10 bg-white/[0.02] opacity-55",
        )}
      >
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            claimed ? "text-emerald-300" : gold ? "text-gold" : "text-green",
          )}
        >
          {money(cents)}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          {claimed ? "Claimed" : isBusy ? "…" : claimable ? "Claim" : locked ? "Locked" : "Reach"}
        </span>
      </button>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-2",
        unlocked ? "border-white/10 bg-white/[0.02]" : "border-transparent opacity-70",
      )}
    >
      <div className="flex items-center justify-center">
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full border text-[11px] font-bold tabular-nums",
            unlocked ? "border-gold/40 bg-black/40 text-gold" : "border-white/10 text-neutral-500",
          )}
        >
          {tier}
        </span>
      </div>
      {cell("free", freeCents, claimedFree, false)}
      {cell("premium", premiumCents, claimedPremium, !hasPremium)}
    </div>
  );
}

export function BattlePassTrack({
  status,
  claiming,
  buying,
  onClaimTier,
  onBuyPremium,
}: {
  status: BattlePassStatus | null;
  claiming: ClaimTarget | null;
  buying: boolean;
  onClaimTier: (t: ClaimTarget) => void;
  onBuyPremium: () => void;
}) {
  if (!status || !status.active || !status.season) {
    return (
      <EmptyState icon="🎟️">
        No battle pass season is live right now. When a new season opens, its reward track appears
        here.
      </EmptyState>
    );
  }

  const { season, tiers = [], xp = 0, premium = false, unlocked_tier = 0 } = status;
  const claimedFree = status.claimed_free ?? {};
  const claimedPremium = status.claimed_premium ?? {};
  const xpPerTier = season.xp_per_tier || 1;
  const intoTier = xp % xpPerTier;
  const tierFrac = unlocked_tier >= season.max_tier ? 1 : intoTier / xpPerTier;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Battle Pass · Season</Eyebrow>
            <GoldHeading className="mt-1 text-2xl">{season.name}</GoldHeading>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill tone={premium ? "gold" : "muted"}>
                {premium ? "★ Premium unlocked" : "Free track"}
              </Pill>
              <Pill tone="green">
                Tier {unlocked_tier} / {season.max_tier}
              </Pill>
              <Pill tone="muted">{xp.toLocaleString()} XP</Pill>
            </div>
          </div>
          {!premium && (
            <Button onClick={onBuyPremium} disabled={buying} variant="gold">
              {buying
                ? "Unlocking…"
                : `Unlock Premium · ${money(season.premium_cents)}`}
            </Button>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
            <span className="uppercase tracking-wider">
              {unlocked_tier >= season.max_tier
                ? "Max tier reached"
                : `Tier ${unlocked_tier} → ${unlocked_tier + 1}`}
            </span>
            <span className="tabular-nums">
              {intoTier.toLocaleString()} / {xpPerTier.toLocaleString()} XP
            </span>
          </div>
          <ProgressBar value={tierFrac} tone="green" />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Earn XP by completing missions to unlock more tiers. Free rewards for everyone; premium
            rewards with the pass.
          </p>
        </div>
      </GlassCard>

      {tiers.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#16191d] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          <div className="mb-2 flex items-center gap-4 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
            <span className="w-16">Free</span>
            <span className="text-gold/70">Premium</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tiers
              .slice()
              .sort((a, b) => a.tier - b.tier)
              .map((t) => (
                <div key={t.tier} className="w-[92px] shrink-0">
                  <TierNode
                    tier={t.tier}
                    freeCents={t.free_cents}
                    premiumCents={t.premium_cents}
                    unlocked={t.tier <= unlocked_tier && t.tier > 0}
                    claimedFree={!!claimedFree[String(t.tier)]}
                    claimedPremium={!!claimedPremium[String(t.tier)]}
                    hasPremium={premium}
                    busy={claiming}
                    onClaim={onClaimTier}
                  />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <EmptyState icon="🎁">This season has no reward tiers configured yet.</EmptyState>
      )}
    </div>
  );
}

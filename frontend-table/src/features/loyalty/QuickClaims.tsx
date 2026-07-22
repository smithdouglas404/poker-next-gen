"use client";

import { Button } from "@/features/ui";

import { NumberTicker } from "./NumberTicker";
import type { DailyBonusStatus, RakebackStatus } from "./loyaltyRpc";
import { compact, money, untilLabel } from "./loyaltyRpc";
import { Eyebrow, GlassCard, Pill, ProgressBar } from "./ui";

export function DailyBonusCard({
  status,
  busy,
  onClaim,
}: {
  status: DailyBonusStatus | null;
  busy: boolean;
  onClaim: () => void;
}) {
  const canClaim = status?.can_claim ?? false;
  const streak = status?.streak ?? 0;
  return (
    <GlassCard hover className="flex flex-col p-5">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow tone="green">Daily Bonus</Eyebrow>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-green tabular-nums">
              <NumberTicker value={status?.chips ?? 0} format={(n) => compact(n)} />
            </span>
            <span className="text-sm text-neutral-400">chips</span>
          </p>
        </div>
        <Pill tone={streak > 0 ? "gold" : "muted"}>🔥 {streak}-day streak</Pill>
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        {canClaim
          ? "Your bonus is ready — claim it and keep your streak alive."
          : status?.next_claim_at
            ? `Next bonus in ${untilLabel(status.next_claim_at)}.`
            : "Come back daily to grow your streak."}
      </p>

      <Button
        onClick={onClaim}
        disabled={busy || !canClaim}
        className="mt-4 w-full"
        variant={canClaim ? "gold" : "outline"}
      >
        {busy ? "Claiming…" : canClaim ? "Claim Daily Bonus" : "Already Claimed"}
      </Button>
    </GlassCard>
  );
}

export function RakebackCard({
  status,
  busy,
  onClaim,
}: {
  status: RakebackStatus | null;
  busy: boolean;
  onClaim: () => void;
}) {
  const claimable = status?.balance_cents ?? 0;
  const lifetime = status?.lifetime_cents ?? 0;
  const pct = status?.percent ?? 0;
  return (
    <GlassCard hover className="flex flex-col p-5">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow>Rakeback</Eyebrow>
          <p className="mt-1.5 text-2xl font-bold text-gold tabular-nums">
            <NumberTicker value={claimable} format={(n) => money(n)} />
          </p>
        </div>
        <Pill tone="gold">{pct}% rate</Pill>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
        <span>Lifetime rakeback</span>
        <span className="tabular-nums text-neutral-300">{money(lifetime)}</span>
      </div>
      <ProgressBar
        className="mt-1.5"
        tone="gold"
        value={lifetime > 0 ? claimable / lifetime : 0}
      />

      <Button
        onClick={onClaim}
        disabled={busy || claimable <= 0}
        className="mt-4 w-full"
        variant={claimable > 0 ? "gold" : "outline"}
      >
        {busy ? "Claiming…" : claimable > 0 ? `Claim ${money(claimable)}` : "Nothing to Claim"}
      </Button>
    </GlassCard>
  );
}

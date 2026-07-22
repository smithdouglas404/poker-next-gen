"use client";

import { Button } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import type { Mission } from "./loyaltyRpc";
import { money, untilLabel } from "./loyaltyRpc";
import { EmptyState, Eyebrow, GlassCard, Pill, ProgressBar } from "./ui";

function MissionCard({
  m,
  busy,
  onClaim,
}: {
  m: Mission;
  busy: boolean;
  onClaim: (id: string) => void;
}) {
  const goal = m.goal || 1;
  const frac = Math.min(1, m.progress / goal);
  const claimable = m.completed && !m.claimed;
  return (
    <GlassCard
      hover
      className={cn(
        "flex flex-col p-4",
        claimable && "border-gold/30 shadow-[0_0_20px_rgba(245,197,24,0.1)]",
        m.claimed && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Pill tone={m.kind === "weekly" ? "green" : "muted"}>{m.kind}</Pill>
            {m.claimed && <Pill tone="emerald">Claimed</Pill>}
          </div>
          <p className="mt-1.5 truncate font-semibold text-white">{m.title}</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">{m.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-gold tabular-nums">{money(m.reward_cents)}</p>
          {m.xp > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green">
              +{m.xp} XP
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span className="tabular-nums">
            {Math.min(m.progress, goal).toLocaleString()} / {goal.toLocaleString()}
          </span>
          {m.expires_at && (
            <span className="text-neutral-600">resets in {untilLabel(m.expires_at)}</span>
          )}
        </div>
        <ProgressBar value={frac} tone={claimable ? "gold" : "green"} />
      </div>

      <Button
        onClick={() => onClaim(m.id)}
        disabled={busy || !claimable}
        variant={claimable ? "gold" : "outline"}
        size="sm"
        className="mt-3 w-full"
      >
        {m.claimed
          ? "Reward Claimed"
          : claimable
            ? busy
              ? "Claiming…"
              : "Claim Reward"
            : `${Math.round(frac * 100)}% complete`}
      </Button>
    </GlassCard>
  );
}

export function MissionsGrid({
  missions,
  claimingId,
  onClaim,
}: {
  missions: Mission[];
  claimingId: string | null;
  onClaim: (id: string) => void;
}) {
  const daily = missions.filter((m) => m.kind !== "weekly");
  const weekly = missions.filter((m) => m.kind === "weekly");

  if (missions.length === 0) {
    return (
      <EmptyState icon="🎯">
        No active missions right now. New daily and weekly missions appear here as they roll out —
        check back soon.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {daily.length > 0 && (
        <div>
          <Eyebrow>Daily Missions</Eyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {daily.map((m) => (
              <MissionCard key={m.id} m={m} busy={claimingId === m.id} onClaim={onClaim} />
            ))}
          </div>
        </div>
      )}
      {weekly.length > 0 && (
        <div>
          <Eyebrow tone="green">Weekly Missions</Eyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weekly.map((m) => (
              <MissionCard key={m.id} m={m} busy={claimingId === m.id} onClaim={onClaim} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

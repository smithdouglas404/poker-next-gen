"use client";

import { cn } from "@/features/ui/tokens";

import type { Achievement, HRPEvent } from "./loyaltyRpc";
import { relTime } from "./loyaltyRpc";
import { EmptyState, Eyebrow } from "./ui";

function humanReason(reason: string): string {
  return reason
    .replace(/[_:]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function AchievementsPanel({
  achievements,
  events,
}: {
  achievements: Achievement[];
  events: HRPEvent[];
}) {
  const sorted = achievements.slice().sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.hrp - b.hrp;
  });
  const unlockedCount = sorted.filter((a) => a.unlocked).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      {/* Achievements */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <Eyebrow>Achievements</Eyebrow>
          <span className="text-[11px] tabular-nums text-neutral-500">
            {unlockedCount}/{sorted.length} unlocked
          </span>
        </div>
        {sorted.length === 0 ? (
          <EmptyState icon="🏅">No achievements catalogued yet.</EmptyState>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {sorted.map((a) => (
              <div
                key={a.code}
                className={cn(
                  "rounded-xl border p-3.5 transition",
                  a.unlocked
                    ? "border-gold/30 bg-gold/[0.06] shadow-[0_0_18px_rgba(245,197,24,0.08)]"
                    : "border-white/10 bg-white/[0.015] opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      "font-semibold",
                      a.unlocked ? "text-gold" : "text-neutral-300",
                    )}
                  >
                    <span className="mr-1">{a.unlocked ? "🏅" : "🔒"}</span>
                    {a.name}
                  </p>
                  <span className="shrink-0 text-[11px] font-bold text-gold tabular-nums">
                    +{a.hrp}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">{a.description}</p>
                {a.unlocked && a.unlocked_at && (
                  <p className="mt-1.5 text-[10px] text-neutral-600">
                    Unlocked {relTime(a.unlocked_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HRP history feed */}
      <div>
        <Eyebrow tone="green">HRP History</Eyebrow>
        {events.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon="📈">
              No HRP events yet. Points you earn at the table show up here.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-200">{humanReason(ev.reason)}</p>
                  <p className="text-[10px] text-neutral-600">{relTime(ev.created_at)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    ev.hrp >= 0 ? "text-green" : "text-red-300",
                  )}
                >
                  {ev.hrp >= 0 ? "+" : ""}
                  {ev.hrp.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

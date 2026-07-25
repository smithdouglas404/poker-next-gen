"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { loyaltyApi, type Mission } from "@/features/loyalty/loyaltyRpc";
import { MissionCard } from "@/features/loyalty/MissionsGrid";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

// Surfaces the player's DAILY missions on the dashboard so the missions/battle-pass
// backend (already built) is visible where players land. Pure surfacing: reuses the
// live `missions_list` / `mission_claim` RPCs via `loyaltyApi` and the existing
// `MissionCard`. Renders nothing when there are no daily missions (no dead chrome).
export function DailyMissionsWidget() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await loyaltyApi.missions();
      setMissions((res.missions ?? []).filter((m) => m.kind !== "weekly"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load missions.");
      setMissions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onClaim = useCallback(
    async (id: string) => {
      setClaimingId(id);
      setError(null);
      try {
        await loyaltyApi.claimMission(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Claim failed.");
      } finally {
        setClaimingId(null);
      }
    },
    [load],
  );

  // Loading is transient; if there are genuinely no daily missions and no error,
  // hide the whole section rather than show an empty box.
  if (missions !== null && missions.length === 0 && !error) return null;

  return (
    <section className={cn(GLASS_PANEL, "p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={HEADING_SM}>Daily Missions</h2>
        <Link
          href="/loyalty"
          className="text-[11px] font-semibold uppercase tracking-wider text-gold hover:underline"
        >
          View all →
        </Link>
      </div>

      {missions === null ? (
        <p className="text-sm text-neutral-500">Loading missions…</p>
      ) : error ? (
        <p className="text-sm text-neutral-500">{error}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {missions.map((m) => (
            <MissionCard key={m.id} m={m} busy={claimingId === m.id} onClaim={onClaim} />
          ))}
        </div>
      )}
    </section>
  );
}

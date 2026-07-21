"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface Level {
  level: number;
  name: string;
  badge: string;
  hrp_required: number;
}

interface Achievement {
  code: string;
  name: string;
  description: string;
  hrp: number;
  unlocked: boolean;
  unlocked_at?: string;
}

interface LoyaltyData {
  hrp_total: number;
  hands_played: number;
  hands_won: number;
  tier: string;
  multiplier: number;
  level: Level;
  next_level: Level | null;
  progress: number;
  achievements: Achievement[];
}

export default function LoyaltyPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await callSessionRpc("loyalty_get", {})) as LoyaltyData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loyalty");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const achievements = (data?.achievements ?? []).slice().sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.hrp - b.hrp;
  });
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">High Roller Points</p>
            <h1 className="mt-1 text-3xl font-semibold">Loyalty</h1>
          </div>
          <Link href="/hub" className="text-sm text-emerald-400 hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200">{error}</div>
        )}
        {loading && <p className="text-neutral-500">Loading…</p>}

        {data && (
          <>
            <section className="rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-950/20 to-black/40 p-6">
              <div className="flex items-center gap-4">
                <div className="text-5xl">{data.level.badge}</div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider text-neutral-500">
                    Level {data.level.level}
                  </p>
                  <p className="text-2xl font-bold text-amber-100">{data.level.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-amber-300">{data.hrp_total.toLocaleString()}</p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">HRP earned</p>
                </div>
              </div>

              {data.next_level ? (
                <div className="mt-5">
                  <div className="mb-1 flex justify-between text-[11px] text-neutral-400">
                    <span>
                      {data.level.name} → {data.next_level.name}
                    </span>
                    <span>
                      {data.hrp_total.toLocaleString()} / {data.next_level.hrp_required.toLocaleString()} HRP
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                      style={{ width: `${Math.round(data.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-center text-sm font-semibold text-amber-300">
                  🌈 Immortal — maximum loyalty reached
                </p>
              )}

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <Stat label="Hands Played" value={data.hands_played.toLocaleString()} />
                <Stat label="Hands Won" value={data.hands_won.toLocaleString()} />
                <Stat
                  label={`${data.tier || "free"} multiplier`}
                  value={`${data.multiplier}×`}
                />
              </div>
              <p className="mt-3 text-center text-[11px] text-neutral-500">
                HRP is earned by <span className="text-neutral-300">playing</span> — win or lose. Higher
                subscription tiers earn faster.
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Achievements</h2>
                <span className="text-xs text-neutral-500">
                  {unlockedCount}/{achievements.length} unlocked
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {achievements.map((a) => (
                  <div
                    key={a.code}
                    className={`rounded-xl border p-4 ${
                      a.unlocked
                        ? "border-amber-400/40 bg-amber-950/15"
                        : "border-white/10 bg-white/[0.02] opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold ${a.unlocked ? "text-amber-100" : "text-neutral-300"}`}>
                        {a.unlocked ? "🏅 " : "🔒 "}
                        {a.name}
                      </p>
                      <span className="text-xs font-semibold text-amber-300">+{a.hrp} HRP</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{a.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
    </div>
  );
}

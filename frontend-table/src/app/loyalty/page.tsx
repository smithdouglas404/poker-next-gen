"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AchievementsPanel } from "@/features/loyalty/AchievementsPanel";
import { BattlePassTrack } from "@/features/loyalty/BattlePassTrack";
import { LoyaltyHero } from "@/features/loyalty/LoyaltyHero";
import { MissionsGrid } from "@/features/loyalty/MissionsGrid";
import { DailyBonusCard, RakebackCard } from "@/features/loyalty/QuickClaims";
import { ReferralsPanel } from "@/features/loyalty/ReferralsPanel";
import { Eyebrow, GoldHeading } from "@/features/loyalty/ui";
import type {
  BattlePassStatus,
  DailyBonusStatus,
  HRPEvent,
  LoyaltyData,
  Mission,
  RakebackStatus,
  ReferralStatus,
} from "@/features/loyalty/loyaltyRpc";
import { loyaltyApi } from "@/features/loyalty/loyaltyRpc";
import { cn } from "@/features/ui/tokens";

type Tab = "overview" | "missions" | "battlepass" | "referrals";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "missions", label: "Missions" },
  { id: "battlepass", label: "Battle Pass" },
  { id: "referrals", label: "Referrals" },
];

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<Toast | null>(null);

  // Server state — every field comes from a real RPC; empties render gracefully.
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [daily, setDaily] = useState<DailyBonusStatus | null>(null);
  const [rakeback, setRakeback] = useState<RakebackStatus | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [battlePass, setBattlePass] = useState<BattlePassStatus | null>(null);
  const [referral, setReferral] = useState<ReferralStatus | null>(null);
  const [history, setHistory] = useState<HRPEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-action busy flags (keeps buttons honest, no optimistic state).
  const [claimingMission, setClaimingMission] = useState<string | null>(null);
  const [claimingBp, setClaimingBp] = useState<{ tier: number; track: "free" | "premium" } | null>(
    null,
  );
  const [buyingPremium, setBuyingPremium] = useState(false);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [claimingRake, setClaimingRake] = useState(false);
  const [claimingReferral, setClaimingReferral] = useState(false);
  const [applyingReferral, setApplyingReferral] = useState(false);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    // loyalty_get is the spine — surface its error. The rest load best-effort so
    // one empty/failed sub-feature never blanks the whole page.
    try {
      setLoyalty(await loyaltyApi.get());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loyalty");
    }
    const settle = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then(set).catch(() => undefined);
    await Promise.all([
      settle(loyaltyApi.dailyBonus(), setDaily),
      settle(loyaltyApi.rakeback(), setRakeback),
      settle(loyaltyApi.missions(), (r) => setMissions(r.missions ?? [])),
      settle(loyaltyApi.battlePass(), setBattlePass),
      settle(loyaltyApi.referralStatus(), setReferral),
      settle(loyaltyApi.history(25, 0), (r) => setHistory(r.events ?? [])),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---- Action handlers (each calls a real RPC, then reloads authoritative state) ----

  const claimDaily = () =>
    void (async () => {
      setClaimingDaily(true);
      try {
        const r = await loyaltyApi.claimDailyBonus();
        if (r.claimed) notify(`Daily bonus claimed — +${(r.chips ?? 0).toLocaleString()} chips.`);
        else notify(r.message ?? "Already claimed — come back later.", "err");
        setDaily(await loyaltyApi.dailyBonus());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingDaily(false);
      }
    })();

  const claimRake = () =>
    void (async () => {
      setClaimingRake(true);
      try {
        const r = await loyaltyApi.claimRakeback();
        notify(`Rakeback claimed — ${(r.claimed_cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}.`);
        setRakeback(await loyaltyApi.rakeback());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingRake(false);
      }
    })();

  const claimMission = (id: string) =>
    void (async () => {
      setClaimingMission(id);
      try {
        const r = await loyaltyApi.claimMission(id);
        notify(`Mission reward claimed — ${r.reward} (+${r.xp_awarded} XP).`);
        const [m, bp] = await Promise.all([loyaltyApi.missions(), loyaltyApi.battlePass()]);
        setMissions(m.missions ?? []);
        setBattlePass(bp);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingMission(null);
      }
    })();

  const claimBpTier = (t: { tier: number; track: "free" | "premium" }) =>
    void (async () => {
      setClaimingBp(t);
      try {
        const r = await loyaltyApi.claimBattlePass(t.tier, t.track);
        notify(`Tier ${r.tier} ${r.track} reward claimed — ${r.reward}.`);
        setBattlePass(await loyaltyApi.battlePass());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingBp(null);
      }
    })();

  const buyPremium = () =>
    void (async () => {
      setBuyingPremium(true);
      try {
        await loyaltyApi.buyBattlePassPremium();
        notify("Premium pass unlocked — premium rewards are now claimable.");
        setBattlePass(await loyaltyApi.battlePass());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Purchase failed", "err");
      } finally {
        setBuyingPremium(false);
      }
    })();

  const claimReferral = () =>
    void (async () => {
      setClaimingReferral(true);
      try {
        const r = await loyaltyApi.claimReferral();
        notify(`Referral rewards claimed — ${r.total} (${r.claimed_count}).`);
        setReferral(await loyaltyApi.referralStatus());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingReferral(false);
      }
    })();

  const applyReferral = (code: string) =>
    void (async () => {
      if (!code) return;
      setApplyingReferral(true);
      try {
        const r = await loyaltyApi.applyReferral(code);
        notify(`Code applied — welcome bonus ${r.reward} credited.`);
        setReferral(await loyaltyApi.referralStatus());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Invalid code", "err");
      } finally {
        setApplyingReferral(false);
      }
    })();

  const missionsReady = useMemo(
    () => missions.filter((m) => m.completed && !m.claimed).length,
    [missions],
  );

  return (
    <div className="min-h-screen text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
              : "border-red-500/30 bg-red-950/50 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <Eyebrow>High Rollers Program</Eyebrow>
            <GoldHeading className="mt-1 text-3xl sm:text-4xl">Loyalty</GoldHeading>
          </div>
          <Link
            href="/hub"
            className="shrink-0 text-sm text-cyan transition hover:text-cyan/80"
          >
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && !loyalty && (
          <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
            Loading your loyalty profile…
          </div>
        )}

        {loyalty && (
          <>
            <LoyaltyHero data={loyalty} />

            <section className="grid gap-4 sm:grid-cols-2">
              <DailyBonusCard status={daily} busy={claimingDaily} onClaim={claimDaily} />
              <RakebackCard status={rakeback} busy={claimingRake} onClaim={claimRake} />
            </section>

            {/* Tabs */}
            <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-1.5 backdrop-blur-xl">
              {TABS.map((t) => {
                const active = tab === t.id;
                const badge =
                  t.id === "missions" && missionsReady > 0 ? missionsReady : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "relative flex-1 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-wide transition",
                      active
                        ? "bg-gradient-to-b from-gold/20 to-gold/5 text-gold shadow-[0_0_18px_rgba(212,175,55,0.12)]"
                        : "text-neutral-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {t.label}
                    {badge !== null && (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <section>
              {tab === "overview" && (
                <AchievementsPanel achievements={loyalty.achievements ?? []} events={history} />
              )}
              {tab === "missions" && (
                <MissionsGrid
                  missions={missions}
                  claimingId={claimingMission}
                  onClaim={claimMission}
                />
              )}
              {tab === "battlepass" && (
                <BattlePassTrack
                  status={battlePass}
                  claiming={claimingBp}
                  buying={buyingPremium}
                  onClaimTier={claimBpTier}
                  onBuyPremium={buyPremium}
                />
              )}
              {tab === "referrals" && (
                <ReferralsPanel
                  status={referral}
                  claiming={claimingReferral}
                  applying={applyingReferral}
                  onClaim={claimReferral}
                  onApply={applyReferral}
                />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

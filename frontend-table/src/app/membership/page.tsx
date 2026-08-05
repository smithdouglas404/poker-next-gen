"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { POP, RISE, STAGGER, STAGGER_ITEM } from "@/features/ui/motion";

import { TierCard } from "@/features/membership/TierCard";
import { membershipApi } from "@/features/membership/membershipRpc";
import { accentFor } from "@/features/membership/tierMeta";
import { PREVIEW_TIERS } from "@/features/membership/previewTiers";
import type {
  BillingInterval,
  KycState,
  MeVerification,
  StatusResponse,
  TierDef,
} from "@/features/membership/types";
import { Button } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_LG, HEADING_SM, cn } from "@/features/ui/tokens";

type Toast = { msg: string; kind: "ok" | "err" };

const FEATURED_TIER = "gold";

export default function MembershipPage() {
  const [tiers, setTiers] = useState<TierDef[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [verification, setVerification] = useState<MeVerification | null>(null);
  const [interval, setIntervalChoice] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const preview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1";
    try {
      const [t, s, k, v] = await Promise.all([
        membershipApi.tiers(),
        membershipApi.status(),
        membershipApi.kycStatus(),
        membershipApi.meVerification(),
      ]);
      // ?preview=1 falls back to the catalog mirrored from billing/tiers.go so the
      // screen is reviewable without a live Nakama. The live list always wins.
      const live = t.tiers ?? [];
      setTiers(live.length > 0 || !preview ? live : PREVIEW_TIERS);
      setOrder(t.order ?? []);
      setStatus(s);
      setKyc(k.kyc ?? null);
      setVerification(v);
    } catch (e) {
      // With no backend the whole Promise.all rejects, so the preview fallback has to
      // live here too — not just on the success path.
      if (preview) setTiers(PREVIEW_TIERS);
      else notify(e instanceof Error ? e.message : "Failed to load membership", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentTier = status?.subscription.tier ?? "free";
  const rankOf = useCallback(
    (id: string) => {
      const i = order.indexOf(id);
      return i === -1 ? tiers.findIndex((t) => t.id === id) : i;
    },
    [order, tiers],
  );
  const currentRank = rankOf(currentTier);

  const upgrade = useCallback(
    async (tierId: string) => {
      setBusy(tierId);
      try {
        const res = await membershipApi.checkout(tierId, interval);
        if (res.kyc_required) {
          notify(res.message ?? "Identity verification is required for this tier.", "err");
          return;
        }
        if (res.configured && res.checkout_url) {
          window.location.href = res.checkout_url;
          return;
        }
        notify(res.message ?? "Billing is not configured yet.", "err");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Checkout failed", "err");
      } finally {
        setBusy(null);
      }
    },
    [interval, notify],
  );

  const cancelSub = useCallback(async () => {
    if (typeof window !== "undefined" && !window.confirm("Cancel your membership? You keep your benefits until the end of the current billing period, then downgrade to Free.")) {
      return;
    }
    setBusy("cancel");
    try {
      const res = await membershipApi.cancel();
      if (res.canceled_at_period_end) {
        notify(res.message ?? "Your membership will cancel at the end of the period.", "ok");
        await load();
      } else {
        notify(res.message ?? "Billing is not configured yet.", "err");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not cancel", "err");
    } finally {
      setBusy(null);
    }
  }, [load, notify]);

  const resumeSub = useCallback(async () => {
    setBusy("resume");
    try {
      const res = await membershipApi.resume();
      if (res.resumed) {
        notify(res.message ?? "Your membership will renew as normal.", "ok");
        await load();
      } else {
        notify(res.message ?? "Billing is not configured yet.", "err");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not resume", "err");
    } finally {
      setBusy(null);
    }
  }, [load, notify]);

  const startVerification = useCallback(
    async (kind: "biometric" | "kyc_aml") => {
      setBusy(`kyc:${kind}`);
      try {
        const res = await membershipApi.kycStart(kind);
        if (res.url) {
          window.location.href = res.url;
          return;
        }
        notify("Verification session opened.", "ok");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start verification", "err");
      } finally {
        setBusy(null);
      }
    },
    [load, notify],
  );

  const currentDef = status?.tier ?? null;
  const accent = accentFor(currentTier);
  // A cancelled membership keeps status "active" until the period ends — that is
  // how Stripe models it. Reading only `status` therefore shows a member who has
  // just cancelled exactly what they saw before, which reads as "the click did
  // nothing" and is how a cancellation turns into a chargeback.
  const cancelling = currentTier !== "free" && !!status?.subscription.cancel_at_period_end;
  const endsOn = status?.subscription.expires_at
    ? new Date(status.subscription.expires_at).toLocaleDateString()
    : null;

  const nextTier = useMemo(() => {
    const sorted = tiers
      .filter((t) => rankOf(t.id) > currentRank)
      .sort((a, b) => rankOf(a.id) - rankOf(b.id));
    return sorted[0] ?? null;
  }, [tiers, rankOf, currentRank]);

  const enforced = verification?.enforced ?? false;
  const biometricVerified = verification?.verifications.biometric === "verified";
  const amlVerified = verification?.verifications.kyc_aml === "verified";
  // The identity gate only matters once a provider is live and the caller is not
  // fully verified — otherwise the backend runs in dormant mode and all upgrades pass.
  const showIdentityGate = enforced && (!biometricVerified || !amlVerified);

  return (
    <div className="min-h-screen text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border-red-500/30 bg-red-950/40 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className={HEADING_SM}>Membership</p>
            <h1 className={cn(HEADING_LG, "mt-1 text-2xl")}>High Rollers Club</h1>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold uppercase tracking-wider text-muted transition hover:text-foreground"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {/* Current status hero */}
        <motion.section
          variants={RISE}
          initial="hidden"
          animate="show"
          className={cn(GLASS_PANEL, "relative overflow-hidden p-6")}
          style={{ boxShadow: `inset 0 0 60px ${accent.glow}` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className={HEADING_SM}>Current plan</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h2 className={cn("font-display text-3xl font-bold uppercase tracking-wide", accent.text)}>
                  {currentDef?.name ?? "Free"}
                </h2>
                {status && (
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      cancelling
                        ? "border-gold/40 text-gold"
                        : status.subscription.status === "active"
                          ? "border-emerald-500/40 text-emerald-300"
                          : "border-white/15 text-neutral-400",
                    )}
                  >
                    {cancelling ? "Cancelling" : status.subscription.status}
                  </span>
                )}
                {status && !status.billing_configured && (
                  <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold/90">
                    Billing not configured
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-sm text-neutral-400">
                {currentDef && currentDef.rakeback_percent > 0
                  ? `Earning ${currentDef.rakeback_percent}% rakeback with ${currentDef.name}.`
                  : "Upgrade for real-money stakes, rakeback, higher limits, and club creation."}
                {endsOn && currentTier !== "free" && (
                  <span className={cancelling ? "text-gold/90" : "text-neutral-600"}>
                    {" "}
                    · {cancelling ? "ends" : "renews"} {endsOn}
                  </span>
                )}
              </p>

              {cancelling && (
                <p className="mt-2 max-w-xl text-[13px] text-gold/90">
                  Your membership is scheduled to end{endsOn ? ` on ${endsOn}` : ""}. You keep every{" "}
                  {currentDef?.name ?? "paid"} benefit until then — resume any time before that
                  date and nothing changes.
                </p>
              )}

              {currentTier !== "free" && status?.billing_configured && (
                cancelling ? (
                  <Button
                    variant="gold"
                    size="sm"
                    className="mt-3"
                    disabled={busy !== null}
                    onClick={() => void resumeSub()}
                  >
                    {busy === "resume" ? "Resuming…" : "Resume membership"}
                  </Button>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void cancelSub()}
                    className="mt-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 underline-offset-2 transition hover:text-[#ff9ba1] hover:underline disabled:opacity-40"
                  >
                    {busy === "cancel" ? "Cancelling…" : "Cancel membership"}
                  </button>
                )
              )}
            </div>

            {nextTier && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Recommended next
                </p>
                <p className={cn("font-display text-xl font-bold uppercase", accentFor(nextTier.id).text)}>
                  {nextTier.name}
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  className="mt-2"
                  disabled={busy !== null}
                  onClick={() => void upgrade(nextTier.id)}
                >
                  {busy === nextTier.id ? "Starting…" : "Upgrade now"}
                </Button>
              </div>
            )}
          </div>
        </motion.section>

        {/* Identity gate — only shown when a provider is live and caller isn't fully verified */}
        <AnimatePresence>
        {showIdentityGate && (
          <motion.section
            variants={POP}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(GLASS_PANEL, "border-gold/25 p-5")}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className={HEADING_SM}>Identity verification</p>
                <p className="mt-1 text-sm text-neutral-400">
                  Biometric unlocks paid memberships. KYC/AML unlocks Gold &amp; Platinum and fiat
                  cashier.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={biometricVerified ? "ghost" : "outline"}
                  size="sm"
                  disabled={biometricVerified || busy !== null}
                  onClick={() => void startVerification("biometric")}
                >
                  {biometricVerified
                    ? "Biometric ✓"
                    : busy === "kyc:biometric"
                      ? "Opening…"
                      : "Verify biometric"}
                </Button>
                <Button
                  variant={amlVerified ? "ghost" : "outline"}
                  size="sm"
                  disabled={amlVerified || busy !== null}
                  onClick={() => void startVerification("kyc_aml")}
                >
                  {amlVerified ? "KYC/AML ✓" : busy === "kyc:kyc_aml" ? "Opening…" : "Verify KYC/AML"}
                </Button>
              </div>
            </div>
            {kyc?.status === "rejected" && kyc.rejection_reason && (
              <p className="mt-3 text-xs text-red-300">Last review: {kyc.rejection_reason}</p>
            )}
          </motion.section>
        )}
        </AnimatePresence>

        {/* Interval toggle */}
        <div className="flex items-center justify-between gap-4">
          <p className={HEADING_SM}>Choose your plan</p>
          <div className={cn(GLASS_PANEL, "inline-flex p-1 text-xs")}>
            {(["month", "year"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setIntervalChoice(opt)}
                className={cn(
                  "rounded-lg px-4 py-1.5 font-semibold uppercase tracking-wider transition",
                  interval === opt
                    ? "bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00]"
                    : "text-neutral-400 hover:text-white",
                )}
              >
                {opt === "month" ? "Monthly" : "Annual"}
                {opt === "year" && <span className="ml-1 opacity-70">· 2 mo free</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing cards */}
        {loading ? (
          <div className={cn(GLASS_PANEL, "flex h-64 items-center justify-center text-sm text-neutral-500")}>
            Loading membership…
          </div>
        ) : (
          // Cards enter in sequence rather than all at once, and `layout` on the parent
          // lets the grid reflow smoothly when the interval toggle changes card heights.
          <motion.section
            layout
            variants={STAGGER}
            initial="hidden"
            animate="show"
            className="grid gap-4 md:grid-cols-3 xl:grid-cols-5"
          >
            {tiers.map((tier) => (
              // h-full + position-only layout so every card in the row ends at the same
              // height; a full `layout` would pin an explicit measured height instead.
              <motion.div key={tier.id} variants={STAGGER_ITEM} layout="position" className="h-full">
              <TierCard
                tier={tier}
                interval={interval}
                isCurrent={tier.id === currentTier}
                isDowngrade={rankOf(tier.id) < currentRank && tier.id !== currentTier}
                featured={tier.id === FEATURED_TIER}
                busy={busy === tier.id}
                locked={
                  enforced &&
                  (tier.id === "gold" || tier.id === "platinum") &&
                  !amlVerified
                }
                onSelect={() => void upgrade(tier.id)}
              />
              </motion.div>
            ))}
          </motion.section>
        )}

        {/* The way OUT of this page. Previously a visitor who wasn't a member had no
            next step here at all — the tier grid was a dead end. Signed-out visitors get
            the Clerk sign-up; signed-in members who still need identity get the real
            verification flow (/kyc), which is what actually unlocks Gold and Platinum. */}
        <div className={cn(GLASS_PANEL, "flex flex-wrap items-center justify-between gap-4 p-5")}>
          <div className="min-w-0">
            <h3 className={HEADING_LG}>{amlVerified ? "You're verified" : "Unlock the higher tiers"}</h3>
            <p className="mt-1 text-[13px] text-neutral-400">
              {amlVerified
                ? "Identity checks are complete — every tier above is available to you."
                : "Gold and Platinum require identity verification before real-money play. It takes a few minutes."}
            </p>
          </div>
          {!amlVerified && (
            <Link href="/kyc" className={cn(BTN_GOLD, "shrink-0 rounded-lg px-5 py-2.5 text-sm")}>
              Complete verification
            </Link>
          )}
        </div>

        <p className="pb-4 text-center text-[11px] text-neutral-600">
          Plans renew automatically. Payments are processed securely via Stripe; your tier activates
          only after payment confirms. Cancel anytime.
        </p>
      </main>
    </div>
  );
}

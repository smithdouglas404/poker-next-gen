"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TierCard } from "@/features/membership/TierCard";
import { membershipApi } from "@/features/membership/membershipRpc";
import { accentFor } from "@/features/membership/tierMeta";
import type {
  BillingInterval,
  KycState,
  MeVerification,
  StatusResponse,
  TierDef,
} from "@/features/membership/types";
import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_LG, HEADING_SM, cn } from "@/features/ui/tokens";

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
    try {
      const [t, s, k, v] = await Promise.all([
        membershipApi.tiers(),
        membershipApi.status(),
        membershipApi.kycStatus(),
        membershipApi.meVerification(),
      ]);
      setTiers(t.tiers ?? []);
      setOrder(t.order ?? []);
      setStatus(s);
      setKyc(k.kyc ?? null);
      setVerification(v);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load membership", "err");
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
            href="/hub"
            className="text-xs font-semibold uppercase tracking-wider text-muted transition hover:text-foreground"
          >
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {/* Current status hero */}
        <section
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
                      status.subscription.status === "active"
                        ? "border-emerald-500/40 text-emerald-300"
                        : "border-white/15 text-neutral-400",
                    )}
                  >
                    {status.subscription.status}
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
                {status?.subscription.expires_at && currentTier !== "free" && (
                  <span className="text-neutral-600">
                    {" "}
                    · renews {new Date(status.subscription.expires_at).toLocaleDateString()}
                  </span>
                )}
              </p>
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
        </section>

        {/* Identity gate — only shown when a provider is live and caller isn't fully verified */}
        {showIdentityGate && (
          <section className={cn(GLASS_PANEL, "border-gold/25 p-5")}>
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
          </section>
        )}

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
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {tiers.map((tier) => (
              <TierCard
                key={tier.id}
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
            ))}
          </section>
        )}

        <p className="pb-4 text-center text-[11px] text-neutral-600">
          Plans renew automatically. Payments are processed securely via Stripe; your tier activates
          only after payment confirms. Cancel anytime.
        </p>
      </main>
    </div>
  );
}

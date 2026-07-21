"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface TierDef {
  id: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  rakeback_percent: number;
  benefits: string[];
}

interface Subscription {
  tier: string;
  status: string;
  expires_at?: string | null;
}

interface StatusResponse {
  subscription: Subscription;
  tier: TierDef;
  billing_configured: boolean;
}

interface KycState {
  status: string; // none | pending | verified | rejected
  level: string;
  rejection_reason?: string;
}

const ACCENT: Record<string, string> = {
  free: "border-white/15",
  bronze: "border-amber-700/50",
  silver: "border-slate-300/40",
  gold: "border-amber-400/60",
  platinum: "border-cyan-300/50",
};

function dollars(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MembershipPage() {
  const [tiers, setTiers] = useState<TierDef[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [interval, setIntervalChoice] = useState<"month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, s, k] = await Promise.all([
        callSessionRpc("subscription_tiers", {}),
        callSessionRpc("subscription_status", {}),
        callSessionRpc("kyc_status", {}),
      ]);
      setTiers((t as { tiers?: TierDef[] }).tiers ?? []);
      setStatus(s as StatusResponse);
      setKyc((k as { kyc?: KycState }).kyc ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load membership");
    }
  }, []);

  const submitKyc = useCallback(async () => {
    setBusy("kyc");
    setMessage(null);
    setError(null);
    try {
      const res = (await callSessionRpc("kyc_submit", { level: "standard", data: {} })) as {
        kyc?: KycState;
      };
      setKyc(res.kyc ?? null);
      setMessage("Identity submitted — pending review. You'll be able to upgrade once verified.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "KYC submission failed");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upgrade = useCallback(
    async (tierId: string) => {
      setBusy(tierId);
      setMessage(null);
      setError(null);
      try {
        const res = (await callSessionRpc("subscription_checkout", {
          tier: tierId,
          interval,
        })) as { configured?: boolean; checkout_url?: string; kyc_required?: boolean; message?: string };
        if (res.kyc_required) {
          setMessage(res.message ?? "Identity verification is required for this tier.");
          return;
        }
        if (res.configured && res.checkout_url) {
          window.location.href = res.checkout_url;
          return;
        }
        setMessage(res.message ?? "Billing is not configured yet.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed");
      } finally {
        setBusy(null);
      }
    },
    [interval],
  );

  const [depositAmount, setDepositAmount] = useState("25");
  const depositCrypto = useCallback(async () => {
    setBusy("deposit");
    setMessage(null);
    setError(null);
    try {
      const cents = Math.round(parseFloat(depositAmount || "0") * 100);
      const res = (await callSessionRpc("wallet_deposit_crypto", { amount_cents: cents })) as {
        configured?: boolean;
        invoice_url?: string;
        message?: string;
      };
      if (res.configured && res.invoice_url) {
        window.location.href = res.invoice_url;
        return;
      }
      setMessage(res.message ?? "Crypto deposits are not configured yet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(null);
    }
  }, [depositAmount]);

  const currentTier = status?.subscription.tier ?? "free";

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Membership</p>
            <h1 className="mt-1 text-3xl font-semibold">High Rollers Club</h1>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200">{error}</div>
        )}
        {message && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-neutral-300">
            Current plan:{" "}
            <span className="font-semibold text-amber-300">
              {status?.tier.name ?? "Free"}
            </span>
            {status?.subscription.expires_at && currentTier !== "free" && (
              <span className="text-neutral-500">
                {" "}
                · renews {new Date(status.subscription.expires_at).toLocaleDateString()}
              </span>
            )}
            {status && !status.billing_configured && (
              <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                billing not configured
              </span>
            )}
          </div>
          <div className="inline-flex rounded-full border border-white/15 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setIntervalChoice("month")}
              className={`rounded-full px-3 py-1 font-semibold ${
                interval === "month" ? "bg-amber-500 text-black" : "text-neutral-300"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIntervalChoice("year")}
              className={`rounded-full px-3 py-1 font-semibold ${
                interval === "year" ? "bg-amber-500 text-black" : "text-neutral-300"
              }`}
            >
              Annual <span className="opacity-70">(2 mo free)</span>
            </button>
          </div>
        </div>

        {kyc && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              kyc.status === "verified"
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                : kyc.status === "pending"
                  ? "border-sky-500/30 bg-sky-950/20 text-sky-200"
                  : kyc.status === "rejected"
                    ? "border-red-500/30 bg-red-950/20 text-red-200"
                    : "border-white/15 bg-white/[0.03] text-neutral-300"
            }`}
          >
            <span>
              <span className="font-semibold">Identity verification:</span>{" "}
              {kyc.status === "verified"
                ? "Verified ✓ — Gold & Platinum unlocked"
                : kyc.status === "pending"
                  ? "Pending review"
                  : kyc.status === "rejected"
                    ? `Rejected${kyc.rejection_reason ? ` — ${kyc.rejection_reason}` : ""}`
                    : "Required for Gold & Platinum"}
            </span>
            {(kyc.status === "none" || kyc.status === "rejected") && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void submitKyc()}
                className="rounded-full border border-amber-400/50 px-4 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-40"
              >
                {busy === "kyc" ? "Submitting…" : "Verify identity"}
              </button>
            )}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {tiers.map((t) => {
            const price = interval === "year" ? t.annual_price_cents : t.monthly_price_cents;
            const isCurrent = t.id === currentTier;
            return (
              <div
                key={t.id}
                className={`flex flex-col rounded-2xl border bg-white/[0.03] p-5 backdrop-blur-xl ${
                  ACCENT[t.id] ?? "border-white/15"
                } ${isCurrent ? "ring-2 ring-amber-400/60" : ""}`}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-black uppercase tracking-wider">{t.name}</h3>
                  {isCurrent && (
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold text-amber-200">
                  {dollars(price)}
                  {price > 0 && (
                    <span className="text-xs font-normal text-neutral-500">
                      /{interval === "year" ? "yr" : "mo"}
                    </span>
                  )}
                </p>

                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-neutral-300">
                  {t.benefits.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={t.id === "free" || isCurrent || busy !== null}
                  onClick={() => void upgrade(t.id)}
                  className="mt-5 rounded-xl bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] px-4 py-2.5 text-sm font-bold text-black transition hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {isCurrent ? "Active" : t.id === "free" ? "—" : busy === t.id ? "Starting…" : "Upgrade"}
                </button>
              </div>
            );
          })}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
          <h2 className="text-lg font-black uppercase tracking-wider text-amber-200">Add funds — crypto</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Fund your wallet with 200+ cryptocurrencies via NOWPayments. Requires a paid
            membership. Your balance is credited automatically once the payment confirms on-chain.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2">
              <span className="text-neutral-500">$</span>
              <input
                type="number"
                min={5}
                step={5}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-24 bg-transparent text-white focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void depositCrypto()}
              className="rounded-xl bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] px-5 py-2.5 text-sm font-bold text-black transition hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-40"
            >
              {busy === "deposit" ? "Starting…" : "Deposit with crypto →"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

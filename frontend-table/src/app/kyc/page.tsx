"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface KycState {
  level: string;
  status: string; // none | pending | verified | rejected
  rejection_reason?: string;
  provider?: string;
}

const LEVELS = [
  {
    level: "basic",
    tier: "Bronze",
    checks: "Passive liveness + face match",
    unlocks: "Real-money micro-stakes · $200/day deposit",
  },
  {
    level: "standard",
    tier: "Silver",
    checks: "+ Phone verification + age estimation",
    unlocks: "Mid-stakes · $1,000/day deposit",
  },
  {
    level: "full",
    tier: "Gold",
    checks: "+ ID verification + proof of address + AML",
    unlocks: "High-stakes · $5,000/day deposit",
  },
  {
    level: "enhanced",
    tier: "Platinum",
    checks: "+ NFC passport + active liveness + biometric",
    unlocks: "Unlimited stakes · $25,000/day deposit",
  },
] as const;

export default function KycPage() {
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await callSessionRpc("kyc_status", {})) as { kyc?: KycState };
      setKyc(data.kyc ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = useCallback(async (level: string) => {
    setBusy(level);
    setError(null);
    try {
      const data = (await callSessionRpc("kyc_start", { level })) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Verification session created but no URL was returned.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification");
    } finally {
      setBusy(null);
    }
  }, []);

  const verifiedLevel = kyc?.status === "verified" ? kyc.level : "";

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300/80">Identity</p>
            <h1 className="mt-1 text-3xl font-semibold">Verification (KYC)</h1>
          </div>
          <Link href="/hub" className="text-sm text-emerald-400 hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <p className="text-sm text-neutral-400">
          Verification follows the money, not the game. Playing with chips is always free — you only
          verify to unlock real-money deposits and higher limits. Each level adds the checks required
          at that financial risk tier.
        </p>

        {kyc && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
            Current status:{" "}
            <span
              className={
                kyc.status === "verified"
                  ? "font-semibold text-emerald-300"
                  : kyc.status === "pending"
                    ? "font-semibold text-amber-300"
                    : kyc.status === "rejected"
                      ? "font-semibold text-red-300"
                      : "text-neutral-400"
              }
            >
              {kyc.status}
              {kyc.level && kyc.level !== "none" ? ` · ${kyc.level}` : ""}
            </span>
            {kyc.rejection_reason ? (
              <p className="mt-1 text-xs text-red-300">{kyc.rejection_reason}</p>
            ) : null}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {LEVELS.map((l) => {
            const isVerified = verifiedLevel === l.level;
            return (
              <div
                key={l.level}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div>
                  <p className="font-semibold">
                    {l.tier} <span className="text-xs text-neutral-500">({l.level})</span>
                  </p>
                  <p className="text-xs text-neutral-400">{l.checks}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-300/80">{l.unlocks}</p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || isVerified}
                  onClick={() => start(l.level)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                    isVerified
                      ? "border border-emerald-500/40 text-emerald-300"
                      : "bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
                  }`}
                >
                  {isVerified ? "Verified ✓" : busy === l.level ? "Starting…" : "Verify"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-neutral-600">
          Identity checks are performed by Didit. Verification is unavailable until the operator
          enables it (Didit API key + per-level workflows).
        </p>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface VerificationState {
  verifications: Record<string, string>; // email | biometric | kyc_aml -> status
  capabilities: Record<string, boolean>;
}

const KINDS = [
  {
    kind: "email",
    title: "Email — Registration",
    checks: "Email verification",
    unlocks: "Register an account · join and create clubs · full lobby",
  },
  {
    kind: "biometric",
    title: "Biometric — Paying & Marketplace",
    checks: "Biometric authentication",
    unlocks: "Buy a membership · buy & sell on the marketplace · generate characters",
  },
  {
    kind: "kyc_aml",
    title: "KYC / AML — Real Money",
    checks: "Full identity + AML screening",
    unlocks: "Fiat deposits & withdrawals (crypto is exempt)",
  },
] as const;

export default function KycPage() {
  const [state, setState] = useState<VerificationState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState((await callSessionRpc("me_verification", {})) as VerificationState);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = useCallback(async (kind: string) => {
    setBusy(kind);
    setError(null);
    try {
      const data = (await callSessionRpc("kyc_start", { kind })) as { url?: string };
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

  const statusOf = (kind: string) => state?.verifications?.[kind] ?? "none";

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
          Verification follows the money, not the game. Guests can set up and play a game for free.
          You only verify to unlock more: <span className="text-neutral-200">email</span> to register
          and use clubs, <span className="text-neutral-200">biometric</span> to pay and trade on the
          marketplace, and <span className="text-neutral-200">KYC/AML</span> to move real money.
        </p>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {KINDS.map((k) => {
            const status = statusOf(k.kind);
            const isVerified = status === "verified";
            const isPending = status === "pending";
            return (
              <div
                key={k.kind}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div>
                  <p className="font-semibold">{k.title}</p>
                  <p className="text-xs text-neutral-400">{k.checks}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-300/80">{k.unlocks}</p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || isVerified}
                  onClick={() => start(k.kind)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                    isVerified
                      ? "border border-emerald-500/40 text-emerald-300"
                      : isPending
                        ? "border border-amber-500/40 text-amber-300"
                        : "bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
                  }`}
                >
                  {isVerified ? "Verified ✓" : isPending ? "Pending…" : busy === k.kind ? "Starting…" : "Verify"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-neutral-600">
          Identity checks are performed by Didit. Verification is unavailable until the operator
          enables it (Didit API key + webhook secret).
        </p>
      </main>
    </div>
  );
}

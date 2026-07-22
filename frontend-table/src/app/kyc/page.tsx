"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ResponsibleGamblingSection } from "@/features/kyc/ResponsibleGamblingSection";
import { VerificationSection } from "@/features/kyc/VerificationSection";
import { kycApi } from "@/features/kyc/kycRpc";
import type { KycRecord, MeVerification, RgLimits } from "@/features/kyc/types";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

type Tab = "identity" | "safer-play";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

export default function KycPage() {
  const [tab, setTab] = useState<Tab>("identity");
  const [me, setMe] = useState<MeVerification | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);
  const [limits, setLimits] = useState<RgLimits | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3400);
  }, []);

  const loadIdentity = useCallback(async () => {
    try {
      const [v, k] = await Promise.all([kycApi.meVerification(), kycApi.kycStatus()]);
      setMe(v);
      setKyc(k.kyc ?? null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load verification", "err");
    }
  }, [notify]);

  const loadLimits = useCallback(async () => {
    try {
      const l = await kycApi.rgLimitsGet();
      setLimits(l.limits ?? null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load limits", "err");
    }
  }, [notify]);

  useEffect(() => {
    void loadIdentity();
    void loadLimits();
  }, [loadIdentity, loadLimits]);

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

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>Compliance &amp; Safer Play</p>
            <h1 className="font-display mt-2 bg-gradient-to-r from-gold-lite via-gold to-[#9a7b2c] bg-clip-text text-3xl font-bold uppercase tracking-wide text-transparent sm:text-4xl">
              Identity &amp; Controls
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Verification follows the money, not the game. Verify to unlock more, and set your own
              limits to stay in control.
            </p>
          </div>
          <Link
            href="/hub"
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-300 transition hover:border-cyan/40 hover:text-cyan"
          >
            ← Command Center
          </Link>
        </div>

        {/* Segmented tabs */}
        <div className={cn(GLASS_PANEL, "mt-8 inline-flex gap-1 p-1")}>
          {(
            [
              { id: "identity", label: "Identity" },
              { id: "safer-play", label: "Safer Play" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-xl px-5 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition",
                tab === t.id
                  ? "bg-white/10 text-foreground shadow-[0_0_18px_rgba(129,236,255,0.12)]"
                  : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="mt-6">
          {tab === "identity" ? (
            <VerificationSection me={me} kyc={kyc} onChanged={loadIdentity} notify={notify} />
          ) : (
            <ResponsibleGamblingSection limits={limits} onChanged={loadLimits} notify={notify} />
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

// Real identity/KYC verification, surfaced inside Profile's "Verification"
// tab. That tab previously showed ONLY provably-fair hand verification
// (VerificationPanel.tsx) — a different, already-built KYC stack
// (features/kyc/VerificationSection.tsx, Didit-backed, real kyc_start /
// kyc_submit / kyc_status RPCs) existed but was reachable only from the
// separate /kyc route. Same component KycPage uses, just fetching its own
// data here so it can drop into a tab instead of a full page.

import { useCallback, useEffect, useState } from "react";

import { VerificationSection } from "@/features/kyc/VerificationSection";
import { kycApi } from "@/features/kyc/kycRpc";
import type { KycRecord, MeVerification } from "@/features/kyc/types";

export function IdentityVerificationSection({
  notify,
}: {
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [me, setMe] = useState<MeVerification | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, k] = await Promise.all([kycApi.meVerification(), kycApi.kycStatus()]);
      setMe(v);
      setKyc(k.kyc ?? null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load verification", "err");
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return <VerificationSection me={me} kyc={kyc} onChanged={load} notify={notify} />;
}

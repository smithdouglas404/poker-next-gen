// Typed wrappers over callSessionRpc for the /kyc surface. Every function maps
// 1:1 to an RPC registered in backend-core/main.go — no fabricated data.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  KycRecord,
  KycStartResult,
  MeVerification,
  RgLimits,
  VerificationKind,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const kycApi = {
  // Identity verification
  meVerification: () => call<MeVerification>("me_verification", {}),
  kycStatus: () => call<{ kyc: KycRecord }>("kyc_status", {}),
  kycStart: (kind: VerificationKind) => call<KycStartResult>("kyc_start", { kind }),
  kycSubmit: (level: string, data: Record<string, unknown>) =>
    call<{ kyc: KycRecord }>("kyc_submit", { level, data }),

  // Responsible gambling
  rgLimitsGet: () => call<{ limits: RgLimits }>("rg_limits_get", {}),
  rgLimitsSet: (limits: {
    deposit_daily_cents: number;
    deposit_weekly_cents: number;
    deposit_monthly_cents: number;
    loss_daily_cents: number;
    session_minutes: number;
  }) => call<{ ok: boolean; limits: RgLimits }>("rg_limits_set", limits),
  rgCoolOff: (hours: number) => call<{ ok: boolean; cool_off_until: string }>("rg_cool_off", { hours }),
  rgSelfExclude: (opts: { days?: number; permanent?: boolean }) =>
    call<{ ok: boolean; self_excluded_until: string; permanent: boolean }>("rg_self_exclude", opts),
};

/** Cents → plain dollar string for an input field, e.g. 25000 → "250". "" when unset. */
export function centsToDollarInput(cents: number | undefined | null): string {
  if (!cents || cents <= 0) return "";
  return String(Math.round(cents) / 100);
}

/** Dollar input string → integer cents. Empty / invalid → 0 (unlimited). */
export function dollarInputToCents(v: string): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** Cents → compact dollar label, e.g. 250000 → "$2,500". */
export function moneyLabel(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** ISO timestamp → human relative "in 3d 4h", or null if in the past/absent. */
export function untilLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return null;
  // Sentinel far-future (permanent) exclusion.
  if (t > new Date("9000-01-01").getTime()) return "permanent";
  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

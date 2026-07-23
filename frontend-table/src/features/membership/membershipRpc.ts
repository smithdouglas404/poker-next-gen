// Typed wrappers over callSessionRpc for the Membership / Tiers surface. Every
// function maps 1:1 to an RPC registered in backend-core/main.go — no fabricated
// data. Scope: tiers catalog, current subscription status, Stripe checkout, and
// the identity gate (KYC) that Gold/Platinum + real-money purchasing require.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  BillingInterval,
  CheckoutResponse,
  KycStartResponse,
  KycStatusResponse,
  MeVerification,
  StatusResponse,
  TiersResponse,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const membershipApi = {
  /** Full membership catalog (prices, limits, benefits). */
  tiers: () => call<TiersResponse>("subscription_tiers", {}),
  /** Caller's current tier + billing-configured flag (lazy-expiry applied). */
  status: () => call<StatusResponse>("subscription_status", {}),
  /** Start a recurring Stripe Checkout session for a paid tier. */
  checkout: (tier: string, interval: BillingInterval) =>
    call<CheckoutResponse>("subscription_checkout", { tier, interval }),
  /** Cancel the caller's subscription at the end of the current period. */
  cancel: () =>
    call<{ configured: boolean; canceled_at_period_end?: boolean; tier?: string; message?: string }>(
      "subscription_cancel",
      {},
    ),
  /** Caller's identity-verification state (none | pending | verified | rejected). */
  kycStatus: () => call<KycStatusResponse>("kyc_status", {}),
  /** Per-kind verification statuses + unlocked capabilities. */
  meVerification: () => call<MeVerification>("me_verification", {}),
  /** Open a hosted Didit verification session for a verification kind. */
  kycStart: (kind: "email" | "biometric" | "kyc_aml") =>
    call<KycStartResponse>("kyc_start", { kind }),
};

/** Cents → dollar label; 0 renders as "Free". */
export function priceLabel(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Cents → compact money, e.g. 500000 → "$5k", -1/unlimited handled by caller. */
export function moneyCompact(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${(dollars / 1_000).toFixed(dollars % 1_000 === 0 ? 0 : 1)}k`;
  return `$${dollars.toFixed(0)}`;
}

/** Compact integer, e.g. 10000 → "10k". */
export function intCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}

// Typed wrappers over callSessionRpc for the Wallet / Cashier surface. Every
// function maps 1:1 to an RPC registered in backend-core/main.go — no fabricated
// data. Empty/unpopulated server responses are rendered gracefully upstream.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

// ---- Response shapes (mirrors backend-core/rpc + store json tags) ----

export interface WalletGetResp {
  user_id: string;
  balance_cents: number;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export interface LedgerResp {
  user_id: string;
  ledger: LedgerEntry[] | null;
}

export interface BucketBalance {
  bucket: string;
  balance: number;
  currency: string;
}

export interface BalancesResp {
  buckets: BucketBalance[] | null;
}

export interface TransferResp {
  ok: boolean;
  buckets: BucketBalance[] | null;
}

// Deposit RPCs return either a "not configured" object or a hosted-invoice URL.
export interface DepositResp {
  configured: boolean;
  message?: string;
  invoice_url?: string; // crypto (NOWPayments)
  checkout_url?: string; // fiat (Stripe)
  deposit_id?: string;
}

export interface WithdrawResp {
  withdrawal_id: string;
  status: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  destination: string;
  gateway: string;
  gateway_payout_id?: string;
  status: string;
  reason?: string;
}

export interface WithdrawalListResp {
  withdrawals: Withdrawal[] | null;
}

export interface BonusStatus {
  chips: number;
  can_claim: boolean;
  streak: number;
  next_claim_at?: string | null;
}

export interface BonusClaimResp {
  claimed: boolean;
  message?: string;
  chips?: number;
  balance_cents?: number;
}

export interface RakebackStatus {
  balance_cents: number;
  lifetime_cents: number;
  percent: number;
}

export interface RakebackClaimResp {
  claimed_cents: number;
}

export interface TierDef {
  name: string;
  deposit_limit_daily_cents: number;
  withdraw_limit_weekly_cents: number;
  rakeback_percent: number;
  daily_bonus_chips: number;
}

export interface SubscriptionStatusResp {
  subscription: { tier: string; status: string; expires_at?: string | null };
  tier: TierDef;
  billing_configured: boolean;
}

export interface VerificationResp {
  enforced: boolean;
  verifications: Record<string, string>;
  capabilities: {
    host_game: boolean;
    clubs: boolean;
    pay: boolean;
    marketplace: boolean;
    deposit_fiat: boolean;
    withdraw: boolean;
  };
}

export const walletApi = {
  get: () => call<WalletGetResp>("wallet_get", {}),
  ledger: (limit = 50) => call<LedgerResp>("wallet_ledger", { limit }),
  balances: () => call<BalancesResp>("wallet_balances", {}),
  transfer: (from: string, to: string, amountCents: number) =>
    call<TransferResp>("wallet_transfer", { from, to, amount_cents: amountCents }),

  depositCrypto: (amountCents: number) =>
    call<DepositResp>("wallet_deposit_crypto", { amount_cents: amountCents }),
  depositFiat: (amountCents: number) =>
    call<DepositResp>("wallet_deposit_fiat", { amount_cents: amountCents }),

  withdraw: (amountCents: number, destination: string, currency: string) =>
    call<WithdrawResp>("wallet_withdraw", {
      amount_cents: amountCents,
      destination,
      currency,
    }),
  withdrawalList: () => call<WithdrawalListResp>("withdrawal_list", {}),

  bonusStatus: () => call<BonusStatus>("daily_bonus_status", {}),
  bonusClaim: () => call<BonusClaimResp>("daily_bonus_claim", {}),

  rakebackStatus: () => call<RakebackStatus>("rakeback_status", {}),
  rakebackClaim: () => call<RakebackClaimResp>("rakeback_claim", {}),

  subscriptionStatus: () => call<SubscriptionStatusResp>("subscription_status", {}),
  verification: () => call<VerificationResp>("me_verification", {}),
};

// ---- formatting helpers ----

/** Cents → full USD, e.g. 482050 → "$4,820.50". */
export function usd(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Cents → compact USD, e.g. 482000 → "$4.8k". */
export function usdCompact(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Parse a user dollar string ("25", "25.50") → integer cents, or null. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const BUCKET_LABELS: Record<string, string> = {
  main: "Main",
  cash_game: "Cash Game",
  sng: "Sit & Go",
  tournament: "Tournament",
  bonus: "Bonus",
};

export function bucketLabel(bucket: string): string {
  return BUCKET_LABELS[bucket] ?? bucket;
}

/** Humanize a ledger reason slug, e.g. "cosmetic_buy" → "Cosmetic Buy". */
export function humanizeReason(reason: string): string {
  return reason
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

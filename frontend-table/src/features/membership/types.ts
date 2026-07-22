// Types mirroring the backend-core subscription/KYC RPC payloads. Every field
// here maps to a Go struct tag in backend-core (billing/tiers.go, store/*.go) —
// nothing fabricated.

export interface TierDef {
  id: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  kyc_level: string;
  deposit_limit_daily_cents: number;
  withdraw_limit_weekly_cents: number;
  max_big_blind_cents: number;
  tournament_buy_in_max_cents: number;
  rakeback_percent: number;
  daily_bonus_chips: number;
  club_create_limit: number;
  club_member_limit: number;
  multi_table_limit: number;
  marketplace_fee_bps: number;
  benefits: string[];
}

export interface TiersResponse {
  tiers?: TierDef[];
  order?: string[];
}

export interface Subscription {
  user_id: string;
  tier: string;
  status: string; // active | inactive | expired
  expires_at?: string | null;
}

export interface StatusResponse {
  subscription: Subscription;
  tier: TierDef;
  billing_configured: boolean;
}

export interface KycState {
  user_id?: string;
  level: string;
  status: string; // none | pending | verified | rejected
  rejection_reason?: string;
}

export interface KycStatusResponse {
  kyc?: KycState;
}

export interface MeVerification {
  enforced: boolean;
  verifications: {
    email: string;
    biometric: string;
    kyc_aml: string;
  };
  capabilities: Record<string, boolean>;
}

export interface CheckoutResponse {
  configured?: boolean;
  checkout_url?: string;
  session_id?: string;
  kyc_required?: boolean;
  message?: string;
}

export interface KycStartResponse {
  url?: string;
  session_id?: string;
  status?: string;
  kind?: string;
}

export type BillingInterval = "month" | "year";

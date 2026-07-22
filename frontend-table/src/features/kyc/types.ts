// Types for the /kyc surface — identity verification + responsible gambling.
// Every shape mirrors a response from an RPC registered in backend-core/main.go.

export type VerificationStatus = "none" | "pending" | "verified" | "rejected";
export type VerificationKind = "email" | "biometric" | "kyc_aml";

/** Response of `me_verification`. */
export interface MeVerification {
  enforced: boolean;
  verifications: Record<VerificationKind, VerificationStatus>;
  capabilities: Record<string, boolean>;
}

/** The KYC record inside `kyc_status` / `kyc_submit` responses. */
export interface KycRecord {
  user_id: string;
  level: string;
  status: VerificationStatus;
  rejection_reason?: string;
  provider?: string;
}

/** Response of `kyc_start`. */
export interface KycStartResult {
  url?: string;
  session_id?: string;
  status?: string;
  kind?: string;
}

/** The RgLimit record inside `rg_limits_get` / `rg_limits_set` responses. */
export interface RgLimits {
  user_id: string;
  deposit_daily_cents: number;
  deposit_weekly_cents: number;
  deposit_monthly_cents: number;
  loss_daily_cents: number;
  session_minutes: number;
  cool_off_until?: string | null;
  self_excluded_until?: string | null;
  updated_at?: string;
}

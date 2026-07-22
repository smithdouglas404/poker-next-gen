// Typed wrappers over the responsible-gambling deposit-limit RPCs. Both map 1:1
// to registered backend-core RPCs (rg_limits_get / rg_limits_set) — a value of 0
// means "no limit" server-side. Used by the Wallet Vault's Deposit Limits panel.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

export interface RgLimits {
  user_id?: string;
  deposit_daily_cents: number;
  deposit_weekly_cents: number;
  deposit_monthly_cents: number;
  loss_daily_cents: number;
  session_minutes: number;
  cool_off_until?: string | null;
  self_excluded_until?: string | null;
  updated_at?: string;
}

export interface RgLimitsResp {
  limits: RgLimits | null;
}

export interface RgLimitsSetResp {
  ok: boolean;
  limits: RgLimits | null;
}

const ZERO: RgLimits = {
  deposit_daily_cents: 0,
  deposit_weekly_cents: 0,
  deposit_monthly_cents: 0,
  loss_daily_cents: 0,
  session_minutes: 0,
};

export const rgLimitsApi = {
  get: () => callSessionRpc("rg_limits_get", {}) as Promise<RgLimitsResp>,
  set: (patch: Partial<RgLimits>) =>
    callSessionRpc("rg_limits_set", {
      deposit_daily_cents: patch.deposit_daily_cents ?? 0,
      deposit_weekly_cents: patch.deposit_weekly_cents ?? 0,
      deposit_monthly_cents: patch.deposit_monthly_cents ?? 0,
      loss_daily_cents: patch.loss_daily_cents ?? 0,
      session_minutes: patch.session_minutes ?? 0,
    }) as Promise<RgLimitsSetResp>,
};

export function emptyLimits(): RgLimits {
  return { ...ZERO };
}

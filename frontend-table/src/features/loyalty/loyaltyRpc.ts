// Typed wrappers over callSessionRpc for the Loyalty / High Rollers Program
// surface. Every function maps 1:1 to an RPC registered in backend-core/main.go —
// no fabricated data. Empty server responses render gracefully upstream.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

// ---------------------------------------------------------------------------
// loyalty_get
// ---------------------------------------------------------------------------

export interface Level {
  level: number;
  name: string;
  badge: string;
  hrp_required: number;
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  hrp: number;
  unlocked: boolean;
  unlocked_at?: string;
}

export interface LoyaltyData {
  hrp_total: number;
  hands_played: number;
  hands_won: number;
  tier: string;
  multiplier: number;
  level: Level;
  next_level: Level | null;
  progress: number;
  achievements: Achievement[];
}

// ---------------------------------------------------------------------------
// missions_list / mission_claim
// ---------------------------------------------------------------------------

export interface Mission {
  id: string;
  code: string;
  title: string;
  description: string;
  kind: string; // daily | weekly
  metric: string;
  goal: number;
  reward_cents: number;
  xp: number;
  period_key: string;
  active: boolean;
  expires_at: string;
  created_at: string;
  progress: number;
  claimed: boolean;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// battlepass_status
// ---------------------------------------------------------------------------

export interface BattlePassTier {
  tier: number;
  free_cents: number;
  premium_cents: number;
}

export interface BattlePassSeason {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  xp_per_tier: number;
  max_tier: number;
  premium_cents: number;
  tiers_json: string;
  created_at: string;
}

export interface BattlePassStatus {
  active: boolean;
  season?: BattlePassSeason;
  tiers?: BattlePassTier[];
  xp?: number;
  premium?: boolean;
  unlocked_tier?: number;
  claimed_free?: Record<string, boolean>;
  claimed_premium?: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// referral_status
// ---------------------------------------------------------------------------

export interface Referral {
  id: string;
  referrer_user_id: string;
  code: string;
  referred_user_id?: string;
  status: string; // issued | applied | claimed
  reward_cents: number;
  referred_reward_cents: number;
  created_at: string;
  applied_at?: string;
  claimed_at?: string;
}

export interface ReferralStatus {
  code: string;
  referrals: Referral[];
  total_referrals: number;
  pending_count: number;
  pending_cents: number;
  pending: string;
  earned_cents: number;
  earned: string;
  was_referred: boolean;
}

// ---------------------------------------------------------------------------
// daily_bonus_status
// ---------------------------------------------------------------------------

export interface DailyBonusStatus {
  chips: number;
  can_claim: boolean;
  streak: number;
  next_claim_at: string | null;
}

// ---------------------------------------------------------------------------
// rakeback_status
// ---------------------------------------------------------------------------

export interface RakebackStatus {
  balance_cents: number;
  lifetime_cents: number;
  percent: number;
}

// ---------------------------------------------------------------------------
// loyalty_history
// ---------------------------------------------------------------------------

export interface HRPEvent {
  id: string;
  user_id: string;
  hrp: number;
  reason: string;
  meta?: unknown;
  created_at: string;
}

export interface LoyaltyHistory {
  events: HRPEvent[] | null;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// API surface — every method calls a real registered RPC
// ---------------------------------------------------------------------------

export const loyaltyApi = {
  get: () => call<LoyaltyData>("loyalty_get", {}),

  missions: () => call<{ missions?: Mission[] | null }>("missions_list", {}),
  claimMission: (missionId: string) =>
    call<{ ok: boolean; reward_cents: number; reward: string; xp_awarded: number }>(
      "mission_claim",
      { mission_id: missionId },
    ),

  battlePass: () => call<BattlePassStatus>("battlepass_status", {}),
  claimBattlePass: (tier: number, track: "free" | "premium") =>
    call<{ ok: boolean; tier: number; track: string; reward_cents: number; reward: string }>(
      "battlepass_claim",
      { tier, track },
    ),
  buyBattlePassPremium: () =>
    call<{ ok: boolean; premium: boolean; paid_cents: number }>(
      "battlepass_purchase_premium",
      {},
    ),

  referralCode: () => call<{ code: string }>("referral_code", {}),
  referralStatus: () => call<ReferralStatus>("referral_status", {}),
  applyReferral: (code: string) =>
    call<{ ok: boolean; reward_cents: number; reward: string }>("referral_apply", { code }),
  claimReferral: () =>
    call<{ ok: boolean; claimed_count: number; total_cents: number; total: string }>(
      "referral_claim",
      {},
    ),

  dailyBonus: () => call<DailyBonusStatus>("daily_bonus_status", {}),
  claimDailyBonus: () =>
    call<{ claimed: boolean; chips?: number; balance_cents?: number; message?: string }>(
      "daily_bonus_claim",
      {},
    ),

  rakeback: () => call<RakebackStatus>("rakeback_status", {}),
  claimRakeback: () => call<{ claimed_cents: number }>("rakeback_claim", {}),

  history: (limit = 25, offset = 0) =>
    call<LoyaltyHistory>("loyalty_history", { limit, offset }),
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Cents → dollar label, e.g. 482000 → "$4,820.00". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Compact integer, e.g. 128700 → "128.7k". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
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

/** Countdown label until an ISO timestamp, e.g. "3h 12m". */
export function untilLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

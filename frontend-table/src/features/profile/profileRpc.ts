// Typed wrappers over callSessionRpc for the Profile surface. Every function
// here maps 1:1 to an RPC registered in backend-core/main.go — no fabricated
// data. Response shapes mirror the Go handlers (rpc/stats.go, rpc/security.go,
// rpc/leaderboard.go, rpc/wallet.go ProfileGet).

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export interface Profile {
  user_id: string;
  username: string;
  balance_cents: number;
}

export interface PlayerStats {
  user_id: string;
  club_id?: string;
  hands: number;
  vpip_pct: number;
  pfr_pct: number;
  wtsd_pct: number;
  wsd_pct: number;
  win_rate_pct: number;
  af: number;
  net_cents: number;
  net: string;
}

export type LeakSeverity = "info" | "warn" | "high";

export interface Leak {
  code: string;
  title: string;
  severity: LeakSeverity;
  detail: string;
  suggestion: string;
}

export interface LeakReport {
  user_id: string;
  hands: number;
  stats: PlayerStats;
  leaks: Leak[];
}

export interface HeadToHead {
  user_id: string;
  opponent: string;
  hands: number;
  my_wins: number;
  opp_wins: number;
  showdowns: number;
  my_net_cents: number;
  opp_net_cents: number;
  my_net: string;
  opp_net: string;
}

export type LeaderboardMetric = "winnings" | "hands" | "hrp";

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  subscore: number;
}

export interface Leaderboard {
  metric: string;
  entries: LeaderboardEntry[];
  cursor: string;
}

export interface TwoFactorSetup {
  otpauth_url: string;
  secret: string;
  backup_codes: string[];
}

export interface ApiKey {
  id: string;
  user_id: string;
  label: string;
  prefix: string;
  revoked: boolean;
  created_at: string;
  last_used_at?: string | null;
}

export interface ApiKeyCreated {
  id: string;
  label: string;
  prefix: string;
  key: string;
}

/** Response of `wallet_get` — authoritative chip balance for the caller. */
export interface WalletBalance {
  user_id: string;
  balance_cents: number;
}

/** Response of `me_verification` — per-kind status + unlocked capabilities. */
export interface Verification {
  enforced: boolean;
  verifications: {
    email: string;
    biometric: string;
    kyc_aml: string;
  };
  capabilities: Record<string, boolean>;
}

export const profileApi = {
  // Identity / analytics
  get: () => call<Profile>("profile_get", {}),
  wallet: () => call<WalletBalance>("wallet_get", {}),
  verification: () => call<Verification>("me_verification", {}),
  stats: (userId?: string, clubId?: string) =>
    call<PlayerStats>("player_stats", { user_id: userId ?? "", club_id: clubId ?? "" }),
  leakReport: (clubId?: string) => call<LeakReport>("leak_report", { club_id: clubId ?? "" }),
  headToHead: (opponentUserId: string, clubId?: string) =>
    call<HeadToHead>("stats_head_to_head", {
      opponent_user_id: opponentUserId,
      club_id: clubId ?? "",
    }),
  leaderboard: (metric: LeaderboardMetric, limit = 25) =>
    call<Leaderboard>("leaderboard_top", { metric, period: "all", limit }),

  // Security — 2FA
  twoFactorSetup: () => call<TwoFactorSetup>("auth_2fa_setup", {}),
  twoFactorVerify: (code: string) =>
    call<{ ok: boolean; enabled: boolean }>("auth_2fa_verify", { code }),
  twoFactorDisable: (code: string) =>
    call<{ ok: boolean; enabled: boolean }>("auth_2fa_disable", { code }),

  // Security — password
  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: boolean }>("auth_change_password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  // Security — API keys
  apiKeyCreate: (label: string) => call<ApiKeyCreated>("api_key_create", { label }),
  apiKeyList: () => call<{ api_keys?: ApiKey[] }>("api_key_list", {}),
  apiKeyRevoke: (id: string) => call<{ ok: boolean }>("api_key_revoke", { id }),
};

/** Cents → dollar label, e.g. -18250 → "-$182.50". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const sign = dollars < 0 ? "-" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Compact integer, e.g. 128700 → "128.7k". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

// ---------------------------------------------------------------------------
// Derived VIP tier — a pure projection of the authoritative me_verification
// capabilities (never a client-invented value). KYC/AML → Platinum, biometric
// → Gold, email → Silver, else Bronze. Mirrors the guest→money capability model.
// ---------------------------------------------------------------------------

export type VipTier = "Platinum" | "Gold" | "Silver" | "Bronze";

const TIER_STYLE: Record<VipTier, { text: string; border: string; glow: string }> = {
  Platinum: { text: "text-[#f5c518]", border: "border-[#f5c518]/45", glow: "rgba(245,197,24,0.4)" },
  Gold: { text: "text-[#f5c518]", border: "border-[#f5c518]/35", glow: "rgba(245,197,24,0.3)" },
  Silver: { text: "text-neutral-200", border: "border-white/20", glow: "rgba(220,220,230,0.25)" },
  Bronze: { text: "text-amber-600", border: "border-amber-700/40", glow: "rgba(180,83,9,0.25)" },
};

export function vipTier(v: Verification | null): VipTier {
  const ver = v?.verifications;
  if (ver?.kyc_aml === "verified") return "Platinum";
  if (ver?.biometric === "verified") return "Gold";
  if (ver?.email === "verified") return "Silver";
  return "Bronze";
}

export function tierStyle(tier: VipTier) {
  return TIER_STYLE[tier];
}

// ---------------------------------------------------------------------------
// Offline demo data. Per DESIGN-SYSTEM the surface must look intentional even
// when a backend value is unavailable. These are clearly-labelled placeholders
// for fields that have no dedicated RPC in the listed set (recent ledger,
// achievements, active sessions, linked crypto wallets). Never persisted.
// ---------------------------------------------------------------------------

export interface Transaction {
  kind: string;
  amount: string;
  positive: boolean;
  date: string;
}

export const DEMO_TRANSACTIONS: Transaction[] = [
  { kind: "Buy-In", amount: "-$10,000", positive: false, date: "2023-11-20" },
  { kind: "Cash-Out", amount: "+$50,000", positive: true, date: "2023-11-22" },
  { kind: "Credit Limit Updated", amount: "$100,000", positive: true, date: "2023-11-25" },
];

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  tier: "common" | "rare" | "epic" | "legendary";
  earned: boolean;
}

export const DEMO_ACHIEVEMENTS: Achievement[] = [
  { id: "first-pot", name: "First Blood", desc: "Won your first pot", tier: "common", earned: true },
  { id: "high-roller", name: "High Roller", desc: "Won a $100k+ pot", tier: "legendary", earned: true },
  { id: "grinder", name: "The Grinder", desc: "Played 25,000 hands", tier: "epic", earned: true },
  { id: "final-table", name: "Final Table", desc: "Reached a tournament final table", tier: "rare", earned: true },
  { id: "iron-will", name: "Iron Will", desc: "Won an all-in as an underdog", tier: "rare", earned: false },
  { id: "shark", name: "Table Shark", desc: "Top the leaderboard for a week", tier: "epic", earned: false },
];

export interface LinkedWalletInfo {
  id: string;
  name: string;
  balance: string;
  short: string;
  emoji: string;
}

export const DEMO_LINKED_WALLETS: LinkedWalletInfo[] = [
  { id: "metamask", name: "MetaMask", balance: "5.4 ETH", short: "0x7a3f…c091", emoji: "🦊" },
  { id: "coinbase", name: "Coinbase", balance: "2.1 ETH", short: "0x1d8b…4e77", emoji: "🔵" },
];

export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export const DEMO_SESSIONS: ActiveSession[] = [
  { id: "s1", device: "Chrome · macOS", location: "Las Vegas, US", lastActive: "now", current: true },
  { id: "s2", device: "iOS App · iPhone 15", location: "Las Vegas, US", lastActive: "2h ago", current: false },
  { id: "s3", device: "Safari · iPad", location: "Reno, US", lastActive: "3d ago", current: false },
];

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

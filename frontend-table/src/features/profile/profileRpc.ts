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

export const profileApi = {
  // Identity / analytics
  get: () => call<Profile>("profile_get", {}),
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

// Typed wrappers over callSessionRpc for the Admin console. Every function maps
// 1:1 to an admin-gated RPC registered in backend-core/main.go — no fabricated
// data. All of these fail with "forbidden" unless the caller is a platform
// admin (ADMIN_USER_IDS), which is exactly what the UI gate on me_roles guards.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  Announcement,
  AntibotScore,
  AuditRow,
  CollusionFlag,
  EnvKey,
  Financials,
  GlobalStats,
  HitlItem,
  IPRule,
  GeoRule,
  KycPendingRow,
  PlatformSetting,
  PresenceOnline,
  Settlement,
  SupportTicket,
  SystemLock,
  UserRow,
  WithdrawalRow,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const adminApi = {
  // Gate + public counters
  roles: () =>
    call<{ platform_admin: boolean; club_admin_of: string[] }>("me_roles", {}),
  globalStats: () => call<GlobalStats>("stats_global", {}),
  presence: () => call<PresenceOnline>("presence_online", {}),

  // Financials / env / system
  financials: () => call<{ financials: Financials }>("admin_financials", {}),
  envStatus: () => call<{ env: EnvKey[] }>("admin_env_status", {}),
  systemLockGet: () => call<SystemLock>("system_lock_get", {}),
  systemLockSet: (locked: boolean, message: string) =>
    call<SystemLock>("system_lock_set", { locked, message }),
  settingsGet: () => call<{ settings: PlatformSetting[] }>("platform_settings_get", {}),
  settingsSet: (key: string, value: string) =>
    call<{ key: string; value: string }>("platform_settings_set", { key, value }),

  // Users
  userSearch: (query: string, limit = 25) =>
    call<{ users: UserRow[] }>("admin_user_search", { query, limit }),
  adjustWallet: (userId: string, deltaCents: number, reason: string) =>
    call<{ user_id: string; balance_cents: number; balance: number }>(
      "admin_user_adjust_wallet",
      { user_id: userId, delta_cents: deltaCents, reason },
    ),
  ban: (userId: string, reason: string) =>
    call<{ ok: boolean; banned: boolean }>("admin_ban", { user_id: userId, reason }),
  unban: (userId: string) =>
    call<{ ok: boolean; banned: boolean }>("admin_unban", { user_id: userId }),
  clubDisable: (clubId: string, reason: string) =>
    call<{ ok: boolean }>("admin_club_disable", { club_id: clubId, reason }),
  tableClose: (matchId: string, reason: string) =>
    call<{ ok: boolean }>("admin_table_close", { match_id: matchId, reason }),

  // KYC review
  kycPending: (limit = 50) =>
    call<{ pending: KycPendingRow[] }>("kyc_pending_list", { limit }),
  kycVerify: (userId: string, status: "verified" | "rejected", level: string, reason: string) =>
    call<{ kyc: unknown }>("kyc_verify_admin", {
      user_id: userId,
      status,
      level,
      reason,
    }),

  // Withdrawals
  withdrawalList: () => call<{ withdrawals: WithdrawalRow[] }>("withdrawal_list", {}),
  withdrawalApprove: (withdrawalId: string) =>
    call<{ status: string; auto_payout: boolean; payout_id: string }>(
      "withdrawal_approve_admin",
      { withdrawal_id: withdrawalId },
    ),
  withdrawalReject: (withdrawalId: string, reason: string) =>
    call<{ status: string }>("withdrawal_reject_admin", {
      withdrawal_id: withdrawalId,
      reason,
    }),

  // Anti-cheat: antibot / collusion / HITL / IP rules
  antibotScan: (limit = 50) =>
    call<{ scanned: number; scores: AntibotScore[] }>("antibot_scan_all", { limit }),
  antibotFlags: (limit = 50) =>
    call<{ flagged: AntibotScore[] }>("antibot_flags_list", { limit }),
  antibotBan: (userId: string, reason: string) =>
    call<{ ok: boolean }>("antibot_ban", { user_id: userId, reason }),
  collusionList: (status = "", limit = 50) =>
    call<{ flags: CollusionFlag[] }>("collusion_list", { status, limit }),
  collusionReview: (flagId: string, status: "confirmed" | "dismissed", note: string) =>
    call<{ ok: boolean }>("collusion_flag_review", { flag_id: flagId, status, note }),
  hitlList: (status = "", limit = 50) =>
    call<{ queue: HitlItem[] }>("hitl_list", { status, limit }),
  hitlReview: (id: string, status: "approved" | "rejected", note: string) =>
    call<{ id: string; status: string }>("hitl_review", { id, status, note }),
  ipRuleList: () => call<{ rules: IPRule[] }>("ip_rule_list", {}),
  ipRuleAdd: (cidr: string, rule: "allow" | "deny", reason: string) =>
    call<{ id: string }>("ip_rule_add", { cidr, rule, reason }),
  ipRuleDelete: (id: string) => call<{ ok: boolean }>("ip_rule_delete", { id }),
  geoRuleList: () => call<{ rules: GeoRule[] }>("geo_rule_list", {}),
  geoRuleSet: (country: string, rule: "allow" | "deny", reason: string) =>
    call<{ ok: boolean }>("geo_rule_set", { country, rule, reason }),
  geoRuleDelete: (country: string) => call<{ ok: boolean }>("geo_rule_delete", { country }),

  // Announcements
  announcementList: (all = true) =>
    call<{ announcements: Announcement[] }>("announcement_list", { all }),
  announcementCreate: (a: {
    title: string;
    body: string;
    severity: string;
    audience: string;
    duration_hours: number;
  }) => call<{ id: string }>("announcement_create", a),
  announcementDelete: (id: string) => call<{ ok: boolean }>("announcement_delete", { id }),

  // Support
  supportList: (status = "", limit = 50) =>
    call<{ tickets: SupportTicket[] }>("support_ticket_list", { all: true, status, limit }),
  supportRespond: (id: string, body: string, status: string) =>
    call<{ ok: boolean }>("support_ticket_admin_respond", { id, body, status }),

  // Finance: settlements / sponsorship / rakeback
  settlementList: (kind = "", status = "", limit = 50) =>
    call<{ settlements: Settlement[] }>("settlement_list", { kind, status, limit }),
  settlementVerify: (id: string) =>
    call<{ id: string; status: string }>("settlement_verify", { id }),
  sponsorshipList: (status = "", limit = 50) =>
    call<{ payouts: Settlement[] }>("sponsorship_payout_list", { status, limit }),
  sponsorshipCreate: (p: {
    counterparty: string;
    amount_cents: number;
    currency: string;
    reference: string;
    note: string;
  }) => call<{ id: string; status: string }>("sponsorship_payout_create", p),
  rakebackProcessAll: () =>
    call<{ users_paid: number; total_cents: number; total_dollars: number; candidates: number }>(
      "rakeback_process_all",
      {},
    ),

  // Audit
  auditList: (limit = 100, offset = 0) =>
    call<{ audit: AuditRow[] }>("admin_audit_list", { limit, offset }),
};

/** Cents → full dollar label, e.g. 482000 → "$4,820.00". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Cents → compact dollar label, e.g. 482000 → "$4.8k". */
export function moneyCompact(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Compact integer, e.g. 128700 → "128.7k". */
export function compactNum(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const past = diff >= 0;
  const m = Math.floor(Math.abs(diff) / 60_000);
  const suffix = past ? "ago" : "from now";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${suffix}`;
  const d = Math.floor(h / 24);
  return `${d}d ${suffix}`;
}

/** Short id preview, e.g. long uuid → "a1b2c3d4…". */
export function shortId(id: string | undefined | null): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

// Response shapes for the admin console. Each mirrors a struct returned by an
// admin-gated RPC in backend-core/rpc (admin.go, aiproc.go, withdrawal.go,
// kyc.go). Fields are optional/loose where the server may return empty sets so
// the UI renders gracefully before data exists.

export interface Financials {
  deposits_credited_cents: number;
  withdrawals_paid_cents: number;
  withdrawals_pending_cents: number;
  wallet_float_cents: number;
  rake_collected_cents: number;
  user_count: number;
  banned_count: number;
}

export interface EnvKey {
  key: string;
  set: boolean;
}

export interface UserRow {
  user_id: string;
  username: string;
  email: string;
  banned: boolean;
  balance_cents: number;
}

export interface KycPendingRow {
  user_id: string;
  level: string;
  status: string;
  data?: unknown;
  provider: string;
  updated_at: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  destination: string;
  gateway: string;
  gateway_payout_id?: string;
  status: string;
  reason?: string;
  created_at?: string;
}

export interface AntibotScore {
  id: string;
  user_id: string;
  score: number;
  risk: string;
  flags?: unknown;
  sample_size: number;
  banned: boolean;
  banned_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CollusionFlag {
  id: string;
  user_a: string;
  user_b: string;
  match_id?: string;
  reason: string;
  score: number;
  status: string;
  reviewed_by?: string;
  review_note?: string;
  created_at: string;
}

export interface HitlItem {
  id: string;
  kind: string;
  subject_user_id: string;
  payload?: unknown;
  status: string;
  note: string;
  reviewed_by: string;
  reviewed_at?: string | null;
  created_at: string;
}

export interface IPRule {
  id: string;
  cidr: string;
  rule: "allow" | "deny";
  reason: string;
  created_by: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: string;
  audience: string;
  starts_at: string;
  created_by?: string;
  created_at: string;
}

export interface TicketMessage {
  author: string;
  role: "user" | "admin";
  body: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  user_id?: string;
  email?: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  messages: TicketMessage[];
  created_at: string;
  updated_at: string;
}

export interface Settlement {
  id: string;
  kind: string;
  reference: string;
  counterparty: string;
  amount_cents: number;
  currency: string;
  status: string;
  note: string;
  created_by: string;
  created_at: string;
  verified_by?: string;
  verified_at?: string | null;
}

export interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target: string;
  detail?: unknown;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  value: string;
  updated_by: string;
  updated_at: string;
}

export interface SystemLock {
  locked: boolean;
  message: string;
}

export interface GlobalStats {
  hands: number;
  players: number;
  clubs: number;
  pot_cents: number;
  rake_cents: number;
  open_tables: number;
}

export interface PresenceOnline {
  online: number;
  players_at_tables: number;
}

export type AdminSection =
  | "overview"
  | "users"
  | "kyc"
  | "withdrawals"
  | "anticheat"
  | "announcements"
  | "support"
  | "finance"
  | "platform"
  | "audit";

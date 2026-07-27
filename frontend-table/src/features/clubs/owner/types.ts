// Local TypeScript shapes for the Club-Owner Hub. These mirror the JSON tags on
// the backend-core store structs (store/clubs_ext.go, club.go, rake.go) so every
// field a control reads is a real server field. Kept independent of the sibling
// clubs feature so this hub is self-contained within owner/.

export interface CreditRequest {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  amount_minor: number;
  reason: string;
  status: string;
  created_at: string;
}

export interface GuestSession {
  id: string;
  club_id: string;
  match_id: string;
  user_id: string;
  username: string;
  limit_minor: number;
  buy_in_minor: number;
  status: string;
  net_minor: number;
  ledger_net_minor: number;
  created_at: string;
  reconcile_due_at?: string | null; // created_at + club window; absent when no window set
  overdue?: boolean;
}

export interface SeatSession {
  id: string;
  match_id: string;
  club_id: string;
  user_id: string;
  username: string;
  buy_in_minor: number;
  hands_played: number;
  stack_at_leave_minor: number;
  net_minor: number;
  ratholed: boolean;
  hit_and_run: boolean;
  status: string; // open | closed
  sat_at: string;
  left_at?: string | null;
}

export interface ClubSchedule {
  id: string;
  club_id: string;
  name: string;
  small_blind: number;
  big_blind: number;
  buy_in: number;
  max_seats: number;
  variant: string;
  weekday: number;
  time_of_day: string;
  enabled: boolean;
  created_at: string;
}

export interface OwnerClub {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface OwnerMembership {
  club_id: string;
  user_id: string;
  username: string;
  role: string;
  status?: string;
}

export interface OwnerClubDetail {
  club: OwnerClub;
  members: OwnerMembership[];
  my_membership: OwnerMembership | null;
  create_fee_cents: number;
}

/** Enriched roster row from club_roster / club_member_stats. */
export interface RosterRow {
  user_id: string;
  username: string;
  role: string;
  status: string;
  joined_at: string;
  balance: number; // allocated club bankroll, cents
  locked_amount: number; // chips locked at live tables, cents
  can_configure: boolean;
  activity_count: number;
}

export interface ClubStats {
  club_id: string;
  member_count: number;
  active_7d: number;
  hands: number;
  win_rate_bps: number;
  chips_won: number;
  tourney_wins: number;
  updated_at: string;
}

export interface ClubActivity {
  id: string;
  club_id: string;
  user_id: string;
  kind: string;
  detail: string;
  created_at: string;
}

export interface QuickStats {
  stats: ClubStats | null;
  member_count: number;
  activity: ClubActivity[];
}

/** One day of the real analytics series (club_analytics_series). */
export interface AnalyticsSeriesPoint {
  day: string;
  label: string;
  active: number;
  events: number;
  new_members: number;
  returning: number;
  rake_cents: number;
  members_cumulative: number;
}

/** Response of club_analytics_series — real per-day engagement/revenue trends. */
export interface AnalyticsSeries {
  club_id: string;
  days: number;
  series: AnalyticsSeriesPoint[];
  new_total: number;
  returning_total: number;
}

/** Join request / invitation from club_requests_list. */
export interface JoinRequest {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  inviter: string;
  type: "invite" | "request";
  role: string;
  credit_limit_cents: number;
  status: string;
  message: string;
  created_at: string;
  /** Server-set expiry (poker_club_invitation.expires_at). Absent = no expiry.
   *  Accepting a lapsed invite is refused server-side, because accepting is what
   *  allocates its credit line against the club. */
  expires_at?: string | null;
}

export interface RakeSeriesPoint {
  day: string;
  amount: number;
  hands: number;
}

export interface RakeReport {
  total_rake: number;
  hand_count: number;
  series: RakeSeriesPoint[];
  period: string;
}

export interface RakeLedgerEntry {
  id: string;
  club_id: string;
  amount: number;
  match_id: string;
  hand_no: number;
  created_at: string;
}

export interface RakeLedger {
  house_balance: number;
  ledger: RakeLedgerEntry[] | null;
}

export type OwnerSection =
  | "overview"
  | "tables"
  | "tournaments"
  | "members"
  | "operators"
  | "announcements"
  | "analytics"
  | "financials"
  | "settings";

export type MemberTab = "all" | "pending" | "banned";

/** poker_club_announcement row (store.ClubAnnouncement). */
export interface ClubAnnouncement {
  id: string;
  club_id: string;
  title: string;
  body: string;
  severity: string; // info | warning | critical
  audience?: string; // all | private | tournament
  channel?: string; // overlay | modal | chat
  created_by: string;
  created_at: string;
}

/** poker_club_chat row (store.ClubChatMessage). */
export interface ClubChatMessage {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  text: string;
  created_at: string;
}

/** models.CustomRakeConfiguration — house rake profile for a club. */
export interface RakeConfig {
  id?: string;
  club_id: string;
  name: string;
  percent_bps: number; // rake as basis points (0–1000 = 0–10%)
  cap_minor: number; // max rake per pot, cents
  no_flop_no_drop: boolean;
  min_pot_minor: number; // cents
  public?: boolean; // opt-in public rake transparency (backend json key is `public`)
  is_active?: boolean;
}

/** settings_json blob persisted through club_update. Client-shaped; the backend
 * stores it opaquely, so every field here is optional and defensively read. */
export interface ClubSettingsBlob {
  brand_color?: string;
  ui_theme?: "classic" | "cyber";
  max_buyin_cents?: number;
  kyc_required?: boolean;
  geo_block?: string;
  club_type?: string;
  logo_data_url?: string; // uploaded club logo (data: URL), set from GlobalSettings/setup
  reconcile_window_hours?: number; // when club-wallet grants must be reconciled (0 = no deadline)
}

/** Owner's club with the visibility/approval flags club_update reads/writes. */
export interface OwnerClubExt extends OwnerClub {
  tag?: string;
  is_public?: boolean;
  require_approval?: boolean;
  currency?: string;
  settings_json?: ClubSettingsBlob;
  // Real columns, not settings_json keys, because the server interprets them:
  // `timezone` resolves club-night schedules, `primary_language` labels the club
  // in the public browser, `twofa_required` is enforced in requireClubConfigurer.
  timezone?: string;
  primary_language?: string;
  twofa_required?: boolean;
}

/** One capability slug from club_permissions_list's catalog. */
export type ClubPermission =
  | "manage_members"
  | "manage_money"
  | "manage_tables"
  | "manage_settings";

/** An operator seat and its capability grid (club_permissions_list). */
export interface ClubSeat {
  user_id: string;
  role: string; // owner | manager | moderator | agent
  equity_bps?: number;
  can_configure?: boolean;
  permissions: ClubPermission[];
  /** No grid assigned yet, so the seat still has FULL access. Render it as such —
   *  never as an empty row of unchecked boxes, which reads as "no permissions"
   *  and is the exact opposite of what the server does. */
  legacy?: boolean;
}

export interface ClubPermissionsPayload {
  club_id: string;
  seats: ClubSeat[];
  catalog: ClubPermission[];
  roles: string[];
  role_preset: Record<string, ClubPermission[]>;
}

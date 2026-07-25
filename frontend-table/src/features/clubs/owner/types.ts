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
  timezone?: string;
  languages?: string;
  brand_color?: string;
  ui_theme?: "classic" | "cyber";
  max_buyin_cents?: number;
  twofa_required?: boolean;
  admin_role?: string;
  moderator_role?: string;
  kyc_required?: boolean;
  geo_block?: string;
  club_type?: string;
  logo_data_url?: string; // uploaded club logo (data: URL), set from GlobalSettings/setup
}

/** Owner's club with the visibility/approval flags club_update reads/writes. */
export interface OwnerClubExt extends OwnerClub {
  tag?: string;
  is_public?: boolean;
  require_approval?: boolean;
  currency?: string;
  settings_json?: ClubSettingsBlob;
}

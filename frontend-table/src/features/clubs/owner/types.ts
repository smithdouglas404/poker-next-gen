// Local TypeScript shapes for the Club-Owner Hub. These mirror the JSON tags on
// the backend-core store structs (store/clubs_ext.go, club.go, rake.go) so every
// field a control reads is a real server field. Kept independent of the sibling
// clubs feature so this hub is self-contained within owner/.

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
  | "dashboard"
  | "tables"
  | "tournaments"
  | "members"
  | "financials";

export type MemberTab = "all" | "pending" | "banned";

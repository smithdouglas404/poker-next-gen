// Shared TypeScript shapes for the Clubs surface. These mirror the JSON tags on
// the backend-core store structs (backend-core/store/clubs_ext.go, club.go,
// missions.go, alliance.go) so every field a control reads is a real server field.

export interface Club {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ClubMember {
  club_id: string;
  user_id: string;
  username: string;
  role: string;
  status?: string;
}

export interface ClubDetail {
  club: Club;
  members: ClubMember[];
  my_membership: ClubMember | null;
  create_fee_cents: number;
}

export interface RosterRow {
  user_id: string;
  username: string;
  role: string;
  status: string;
  joined_at: string;
  balance: number;
  locked_amount: number;
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

export interface Invitation {
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

export interface Announcement {
  id: string;
  club_id: string;
  title: string;
  body: string;
  severity: string;
  created_by: string;
  created_at: string;
}

export interface ClubEvent {
  id: string;
  club_id: string;
  name: string;
  scheduled_at: string;
  small_blind: number;
  big_blind: number;
  variant: string;
  format: string;
  created_by: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  text: string;
  created_at: string;
}

export interface Mission {
  id: string;
  code: string;
  title: string;
  description: string;
  kind: string;
  metric: string;
  goal: number;
  reward_cents: number;
  xp: number;
  progress: number;
  claimed: boolean;
  completed: boolean;
}

export interface Alliance {
  id: string;
  name: string;
  founding_club_id: string;
  created_at: string;
}

export interface AllianceMember {
  alliance_id: string;
  club_id: string;
}

export interface RakeReport {
  total_rake: number;
  hand_count: number;
  series: Array<{ day: string; amount: number; hands: number }>;
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

export type ClubSection =
  | "dashboard"
  | "members"
  | "games"
  | "settings"
  | "alliances"
  | "analytics";

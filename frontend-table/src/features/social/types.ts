// Shared TypeScript shapes for the Social surface (Alliances / Leagues / Club Wars).
// These mirror the JSON tags on the backend-core store structs
// (store/alliance.go, store/league.go, store/clubwar.go) and the RPC handler
// responses (rpc/alliance.go, rpc/league.go, rpc/clubwar.go) so every field a
// control reads is a real server field.

export interface Club {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface MeRoles {
  platform_admin: boolean;
  club_admin_of: string[];
}

// ---- Alliances ----

export interface Alliance {
  id: string;
  name: string;
  founding_club_id: string;
  created_at: string;
}

export interface AllianceMember {
  alliance_id: string;
  club_id: string;
  joined_at: string;
}

export interface AllianceDetail {
  alliance: Alliance | null;
  members?: AllianceMember[];
}

// ---- Leagues ----

export type LeagueStatus = "registering" | "active" | "completed";

export interface League {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: LeagueStatus;
  created_at: string;
}

export interface LeagueStanding {
  league_id: string;
  club_id: string;
  points: number;
  wins: number;
  losses: number;
}

export interface LeagueDetail {
  league: League;
  standings?: LeagueStanding[] | null;
}

// ---- Club Wars ----

export type WarStatus = "pending" | "active" | "completed";

export interface ClubWar {
  id: string;
  club_a: string;
  club_b: string;
  status: WarStatus;
  winner_id: string;
  scheduled_at: string;
  score_a: number;
  score_b: number;
  created_at: string;
}

export interface ClubWarHand {
  id: string;
  war_id: string;
  match_id: string;
  hand_no: number;
  club_id: string;
  delta: number;
  created_at: string;
}

export interface ClubWarDetail {
  war: ClubWar;
  hands?: ClubWarHand[] | null;
}

export interface ClubWarResult {
  war: ClubWar;
  elo_a: number;
  elo_b: number;
  prev_elo_a: number;
  prev_elo_b: number;
  already_settled?: boolean;
}

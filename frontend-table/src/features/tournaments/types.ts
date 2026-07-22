// Shared tournament types — mirror the backend-core RPC payloads
// (models.TournamentBracket, BlindTimer, PrizeDistributionPool, tournament_ext
// status/analytics, leaderboard_top). Fields are optional where the director
// may not have populated them yet (best-effort snapshots).

/** models.TournamentBracket — one tournament instance (tournament_list rows). */
export interface Tournament {
  id: string;
  name: string;
  variant: string;
  buy_in_minor: number;
  fee_minor?: number;
  starting_stack: number;
  max_players: number;
  max_seats_per_table?: number;
  status: string; // registering | running | finished
  scheduled_at: string;
  created_at?: string;
}

/** models.BlindTimer — one blind level. */
export interface BlindLevel {
  id?: string;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_secs: number;
  is_break?: boolean;
}

/** models.PrizeDistributionPool — one payout tier. */
export interface Prize {
  rank_from: number;
  rank_to: number;
  payout_bps: number;
  guaranteed_minor: number;
}

/** leaderboard_top row / tournament_status standing. */
export interface LeaderEntry {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  subscore?: number;
  hands?: number; // hands played (leaderboard view); falls back to subscore
  avatar?: string; // optional avatar id/url (leaderboard view)
}

/** tournament_status live snapshot. */
export interface TournamentStatus {
  tournament_id: string;
  name: string;
  status: string;
  format?: string;
  variant?: string;
  level?: number;
  late_reg_secs?: number;
  time_bank_secs?: number;
  registered_count?: number;
  players_left?: number;
  buy_in_minor?: number;
  prize_pool_minor?: number;
  prize_pool_display?: string;
  tables?: { table_no?: number; players?: number }[];
  standings?: LeaderEntry[];
  eliminations?: { username?: string; place?: number }[];
}

/** tournament_analytics financial + progress overview. */
export interface TournamentAnalytics {
  tournament_id: string;
  name: string;
  status: string;
  format?: string;
  entrants?: number;
  players_left?: number;
  progress_pct?: number;
  level?: number;
  starting_stack?: number;
  max_players?: number;
  buy_in_minor?: number;
  fee_minor?: number;
  prize_pool_minor?: number;
  prize_pool_display?: string;
  total_fees_minor?: number;
  total_fees_display?: string;
  prizes?: Prize[];
  finishers?: { username?: string; finish_place?: number }[];
  // Financial-overview / summary extras (derived client-side when the snapshot
  // does not carry them — the payout master surfaces these).
  rebuys_minor?: number; // re-buys / add-ons contribution to the pool
  rake_minor?: number; // club rake (same as total fees unless overridden)
  hands_played?: number; // total hands dealt so far
  avg_stack?: number; // average stack in chips
}

/** UI-only enrichment layered on top of a Tournament for the lobby cards. */
export interface LobbyMeta {
  tag?: string; // MAJOR SERIES, TURBO, SATELLITE…
  tagTone?: "gold" | "cyan" | "green" | "purple" | "red";
  format?: string; // NL Hold'em, PLO 4-Card…
  speed?: string; // Deep Stack, Turbo, Hyper…
  lateReg?: boolean;
  satelliteOf?: string;
  locked?: boolean;
  featured?: boolean;
  heroArt?: string; // css gradient used behind featured hero
}

export type EnrichedTournament = Tournament & { meta?: LobbyMeta };

export type OwnerBucket = "live" | "upcoming" | "completed" | "drafts";
export type TopTab = "lobby" | "center" | "board";

/** Draft held client-side by the create panel before publish. */
export interface DraftForm {
  name: string;
  variant: string;
  buyIn: number; // dollars
  fee: number; // dollars
  startingStack: number;
  maxPlayers: number;
  maxSeatsPerTable: number;
  levelMinutes: number;
  numLevels: number;
  payoutStructure: string;
  guaranteedPrize: number; // dollars
  lateReg: boolean;
  scheduledAt: string; // datetime-local value
  regCloseAt: string; // datetime-local value (late-reg close)
}

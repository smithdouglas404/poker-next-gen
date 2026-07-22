// Demo dataset — the clear no-backend fallback shown to guests / when the
// tournament RPCs are unreachable. Every list the live path fills has a demo
// twin here so the surface never renders empty in showcase mode. Demo data is
// always labelled "DEMO" in the UI so it is never confused with live truth.

import type {
  BlindLevel,
  EnrichedTournament,
  LeaderEntry,
  Prize,
  TournamentAnalytics,
  TournamentStatus,
} from "./types";

const now = Date.now();
function iso(minsFromNow: number): string {
  return new Date(now + minsFromNow * 60_000).toISOString();
}

export const DEMO_TOURNAMENTS: EnrichedTournament[] = [
  {
    id: "demo-obsidian",
    name: "The Obsidian Invitational",
    variant: "texas-holdem",
    buy_in_minor: 2_500_000,
    fee_minor: 250_000,
    starting_stack: 100_000,
    max_players: 30,
    status: "registering",
    scheduled_at: iso(42),
    meta: {
      tag: "MAJOR SERIES",
      tagTone: "gold",
      format: "NL Hold'em",
      speed: "Elite",
      featured: true,
      heroArt: "radial-gradient(120% 120% at 85% 0%, rgba(245,197,24,0.10), transparent 55%), #16191d",
    },
  },
  {
    id: "demo-blitz",
    name: "Neon Blitz Showdown",
    variant: "texas-holdem",
    buy_in_minor: 120_000,
    fee_minor: 12_000,
    starting_stack: 20_000,
    max_players: 100,
    status: "running",
    scheduled_at: iso(-8),
    meta: {
      tag: "TURBO",
      tagTone: "red",
      format: "NL Hold'em",
      speed: "Turbo",
      featured: true,
      heroArt: "radial-gradient(120% 120% at 15% 0%, rgba(224,30,43,0.10), transparent 55%), #16191d",
    },
  },
  {
    id: "demo-vanguard",
    name: "Vanguard Super Deepstack",
    variant: "texas-holdem",
    buy_in_minor: 27_500,
    fee_minor: 2_500,
    starting_stack: 50_000,
    max_players: 300,
    status: "registering",
    scheduled_at: iso(12),
    meta: { tag: "DEEP STACK", tagTone: "purple", format: "NL Hold'em", speed: "Deep Stack" },
  },
  {
    id: "demo-bounty",
    name: "Midnight Bounty Hunter",
    variant: "texas-holdem",
    buy_in_minor: 22_000,
    fee_minor: 2_000,
    starting_stack: 15_000,
    max_players: 500,
    status: "running",
    scheduled_at: iso(-25),
    meta: { tag: "BOUNTY", tagTone: "red", format: "NL Hold'em", speed: "Regular", lateReg: true },
  },
  {
    id: "demo-satellite",
    name: "Satellite to $1M Gtd",
    variant: "texas-holdem",
    buy_in_minor: 5_000,
    fee_minor: 500,
    starting_stack: 10_000,
    max_players: 150,
    status: "registering",
    scheduled_at: iso(45),
    meta: { tag: "SATELLITE", tagTone: "green", format: "NL Hold'em", speed: "Regular", satelliteOf: "10 Tickets Gtd" },
  },
  {
    id: "demo-omaha",
    name: "Omaha High Roller",
    variant: "plo",
    buy_in_minor: 1_000_000,
    fee_minor: 100_000,
    starting_stack: 40_000,
    max_players: 60,
    status: "registering",
    scheduled_at: iso(135),
    meta: { tag: "HIGH ROLLER", tagTone: "gold", format: "PLO 4-Card", speed: "Deep Stack", locked: true },
  },
  {
    id: "demo-velocity",
    name: "Neon Velocity Turbo",
    variant: "texas-holdem",
    buy_in_minor: 5_000,
    fee_minor: 500,
    starting_stack: 12_000,
    max_players: 250,
    status: "running",
    scheduled_at: iso(-70),
    meta: { tag: "FAST", tagTone: "cyan", format: "NL Hold'em", speed: "Fast" },
  },
  {
    id: "demo-emerald",
    name: "Emerald High Stakes",
    variant: "texas-holdem",
    buy_in_minor: 5_000_000,
    fee_minor: 500_000,
    starting_stack: 80_000,
    max_players: 100,
    status: "registering",
    scheduled_at: iso(220),
    meta: { tag: "MAJOR", tagTone: "green", format: "NL Hold'em", speed: "Deep Stack" },
  },
  {
    id: "demo-winter-cup",
    name: "Winter Championship Cup",
    variant: "texas-holdem",
    buy_in_minor: 250_000,
    fee_minor: 25_000,
    starting_stack: 60_000,
    max_players: 500,
    status: "finished",
    scheduled_at: iso(-1440),
    meta: { tag: "MAJOR SERIES", tagTone: "gold", format: "NL Hold'em", speed: "Regular" },
  },
];

/** Demo per-tournament registered counts (drives lobby "142/250"). */
export const DEMO_REGISTERED: Record<string, number> = {
  "demo-obsidian": 18,
  "demo-blitz": 42,
  "demo-vanguard": 156,
  "demo-bounty": 92,
  "demo-satellite": 31,
  "demo-omaha": 12,
  "demo-velocity": 142,
  "demo-emerald": 56,
  "demo-winter-cup": 500,
};

export const DEMO_BLINDS: BlindLevel[] = [
  { level: 1, small_blind: 500, big_blind: 1_000, ante: 100, duration_secs: 900 },
  { level: 2, small_blind: 800, big_blind: 1_600, ante: 200, duration_secs: 900 },
  { level: 3, small_blind: 1_500, big_blind: 3_000, ante: 300, duration_secs: 900 },
  { level: 4, small_blind: 2_000, big_blind: 4_000, ante: 400, duration_secs: 900 },
  { level: 0, small_blind: 0, big_blind: 0, ante: 0, duration_secs: 300, is_break: true },
  { level: 5, small_blind: 3_000, big_blind: 6_000, ante: 600, duration_secs: 900 },
  { level: 6, small_blind: 5_000, big_blind: 10_000, ante: 1_000, duration_secs: 900 },
];

export const DEMO_PRIZES: Prize[] = [
  { rank_from: 1, rank_to: 1, payout_bps: 3000, guaranteed_minor: 30_000_000 },
  { rank_from: 2, rank_to: 2, payout_bps: 2000, guaranteed_minor: 0 },
  { rank_from: 3, rank_to: 3, payout_bps: 1300, guaranteed_minor: 0 },
  { rank_from: 4, rank_to: 5, payout_bps: 900, guaranteed_minor: 0 },
  { rank_from: 6, rank_to: 9, payout_bps: 600, guaranteed_minor: 0 },
  { rank_from: 10, rank_to: 15, payout_bps: 400, guaranteed_minor: 0 },
];

export const DEMO_LEADERBOARD: LeaderEntry[] = [
  { rank: 1, user_id: "u-cyber", username: "CyberKing", score: 7_500_000, hands: 120 },
  { rank: 2, user_id: "u-neon", username: "NeonRider", score: 5_200_000, hands: 115 },
  { rank: 3, user_id: "u-data", username: "DataPhantom", score: 4_800_000, hands: 118 },
  { rank: 4, user_id: "u-byte4", username: "ByteMaster", score: 3_900_000, hands: 110 },
  { rank: 5, user_id: "u-byte5", username: "ByteMaster", score: 3_600_000, hands: 110 },
  { rank: 6, user_id: "u-ride6", username: "ByterRide", score: 3_400_000, hands: 108 },
  { rank: 7, user_id: "u-byte7", username: "ByteMaster", score: 3_100_000, hands: 106 },
  { rank: 8, user_id: "u-byte8", username: "GhostByte", score: 2_850_000, hands: 104 },
  { rank: 9, user_id: "u-quartz", username: "QuartzKing", score: 2_400_000, hands: 101 },
  { rank: 10, user_id: "u-oracle", username: "TheOracle", score: 2_150_000, hands: 99 },
];

export function demoStatus(id: string): TournamentStatus {
  const t = DEMO_TOURNAMENTS.find((x) => x.id === id) ?? DEMO_TOURNAMENTS[0];
  const registered = DEMO_REGISTERED[id] ?? 24;
  const left = t.status === "running" ? Math.max(2, Math.floor(registered * 0.4)) : registered;
  return {
    tournament_id: t.id,
    name: t.name,
    status: t.status,
    format: t.meta?.format,
    variant: t.variant,
    level: t.status === "running" ? 3 : 0,
    late_reg_secs: 3600,
    time_bank_secs: 60,
    registered_count: registered,
    players_left: left,
    buy_in_minor: t.buy_in_minor,
    prize_pool_minor: registered * t.buy_in_minor,
    prize_pool_display: undefined,
    tables: [
      { table_no: 1, players: 6 },
      { table_no: 2, players: 6 },
      { table_no: 3, players: 5 },
    ],
    standings: DEMO_LEADERBOARD,
    eliminations: [
      { username: "PixelShark", place: registered - 1 },
      { username: "VaultRat", place: registered },
    ],
  };
}

export function demoAnalytics(id: string): TournamentAnalytics {
  const t = DEMO_TOURNAMENTS.find((x) => x.id === id) ?? DEMO_TOURNAMENTS[0];
  const entrants = DEMO_REGISTERED[id] ?? 24;
  const left = t.status === "running" ? Math.max(1, Math.floor(entrants * 0.35)) : entrants;
  const pool = entrants * t.buy_in_minor;
  return {
    tournament_id: t.id,
    name: t.name,
    status: t.status,
    format: t.meta?.format,
    entrants,
    players_left: left,
    progress_pct: entrants > 0 ? ((entrants - left) / entrants) * 100 : 0,
    level: t.status === "running" ? 3 : 0,
    starting_stack: t.starting_stack,
    max_players: t.max_players,
    buy_in_minor: t.buy_in_minor,
    fee_minor: t.fee_minor ?? 0,
    prize_pool_minor: pool,
    total_fees_minor: entrants * (t.fee_minor ?? 0),
    rebuys_minor: Math.round(pool * 0.12),
    rake_minor: entrants * (t.fee_minor ?? 0),
    hands_played: t.status === "registering" ? 0 : 2_450 - left * 8,
    avg_stack: left > 0 ? Math.round((entrants * t.starting_stack) / left) : t.starting_stack,
    prizes: DEMO_PRIZES,
    finishers: t.status === "finished"
      ? [
          { username: "Ghost_Runner", finish_place: 1 },
          { username: "CyberVixen", finish_place: 2 },
          { username: "TheOracle", finish_place: 3 },
        ]
      : [],
  };
}

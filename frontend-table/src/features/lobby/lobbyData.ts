// Shared types + demo fallbacks for the /lobby experience. Demo data is the
// clear no-backend fallback (guest/offline) — it is always visibly labeled as
// demo in the UI and never presented as live server state.

export type LobbyView = "select" | "private" | "public" | "tournament";

export interface MeRoles {
  platform_admin?: boolean;
  club_admin_of?: string[];
}

export interface ClubLite {
  id: string;
  name: string;
  slug?: string;
}

export interface TournamentLite {
  id: string;
  name: string;
  variant?: string;
  buy_in_minor?: number;
  starting_stack?: number;
  max_players?: number;
  registered?: number;
  prize_pool_minor?: number;
  status?: string;
  scheduled_at?: string;
}

export interface PublicTableRow {
  match_id: string;
  name: string;
  seated: number;
  capacity: number;
  buy_in_minor: number;
  host: string;
  demo?: boolean;
}

// ---- blind presets ---------------------------------------------------------

export const BLIND_PRESETS: Array<{ label: string; sb: number; bb: number }> = [
  { label: "$0.50 / $1", sb: 50, bb: 100 },
  { label: "$1 / $2", sb: 100, bb: 200 },
  { label: "$2 / $5", sb: 200, bb: 500 },
  { label: "$5 / $10", sb: 500, bb: 1000 },
  { label: "$25 / $50", sb: 2500, bb: 5000 },
  { label: "$50 / $100", sb: 5000, bb: 10000 },
];

export const DURATION_OPTIONS: Array<{ label: string; mins: number }> = [
  { label: "No limit", mins: 0 },
  { label: "30 minutes", mins: 30 },
  { label: "1 hour", mins: 60 },
  { label: "3 hours", mins: 180 },
  { label: "6 hours", mins: 360 },
];

// ---- demo fallbacks --------------------------------------------------------

export const DEMO_PUBLIC_TABLES: PublicTableRow[] = [
  { match_id: "demo-hrce", name: "High Rollers Club Elite", seated: 5, capacity: 10, buy_in_minor: 100000, host: "Club Owner", demo: true },
  { match_id: "demo-prestige-room", name: "Prestige Poker Room", seated: 5, capacity: 10, buy_in_minor: 100000, host: "Club Owner", demo: true },
  { match_id: "demo-diamond-1", name: "Diamond Flush", seated: 5, capacity: 10, buy_in_minor: 100000, host: "Club Owner", demo: true },
  { match_id: "demo-prestige", name: "Prestige Poker", seated: 5, capacity: 10, buy_in_minor: 100000, host: "Club Owner", demo: true },
  { match_id: "demo-diamond-2", name: "Diamond Flush", seated: 5, capacity: 10, buy_in_minor: 100000, host: "Club Owner", demo: true },
  { match_id: "demo-vault", name: "Neon Vault VIP", seated: 3, capacity: 9, buy_in_minor: 50000, host: "Club Owner", demo: true },
];

export const DEMO_TOURNAMENTS: TournamentLite[] = [
  { id: "demo-t1", name: "Stake Freeout", variant: "texas-holdem", buy_in_minor: 15000, starting_stack: 20000, max_players: 100, registered: 42, prize_pool_minor: 15000000, status: "running", scheduled_at: "" },
  { id: "demo-t2", name: "Sunday Vault Major", variant: "texas-holdem", buy_in_minor: 25000, starting_stack: 30000, max_players: 500, registered: 318, prize_pool_minor: 45000000, status: "registering", scheduled_at: "" },
  { id: "demo-t3", name: "Neon Turbo Bounty", variant: "plo", buy_in_minor: 5000, starting_stack: 15000, max_players: 200, registered: 96, prize_pool_minor: 8000000, status: "registering", scheduled_at: "" },
];

export const DEMO_CLUBS: ClubLite[] = [
  { id: "demo-club", name: "High Rollers Club", slug: "high-rollers" },
];

/** A short shareable-style code for the offline demo confirmation only. */
export function demoRoomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function normalizeTournaments(raw: unknown): TournamentLite[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { tournaments?: unknown }).tournaments;
  return Array.isArray(list) ? (list as TournamentLite[]) : [];
}

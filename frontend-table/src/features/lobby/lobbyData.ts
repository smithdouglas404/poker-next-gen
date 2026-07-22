// Shared types + demo fallbacks for the /lobby experience. Demo data is the
// clear no-backend fallback (guest/offline) — it is always visibly labeled as
// demo in the UI and never presented as live server state.

export type LobbyView = "select" | "private" | "public" | "tournament" | "browse";

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
  small_blind_minor?: number;
  big_blind_minor?: number;
  variant?: string;
  live?: boolean;
  demo?: boolean;
}

// ---- advanced table-access configuration -----------------------------------
// Extra fields the "Advanced Table Access Configuration" master (detailed_8)
// layers onto the create-table flow. All are transmitted with the real
// `table_create` RPC; unknown fields are ignored server-side today, keeping the
// wiring honest (exactly the config the host chose is what is sent).

export type AccessType = "members" | "invite" | "public";

export const ACCESS_TYPES: Array<{ value: AccessType; label: string; blurb: string }> = [
  { value: "members", label: "Members Only", blurb: "Only club members may sit — hidden from the public list." },
  { value: "invite", label: "Invite Only — Code Required", blurb: "Anyone with the join code can take a seat." },
  { value: "public", label: "Public", blurb: "Listed in the public lobby for anyone to join." },
];

export const DECISION_TIME_OPTIONS: Array<{ label: string; secs: number }> = [
  { label: "10 Seconds", secs: 10 },
  { label: "15 Seconds", secs: 15 },
  { label: "20 Seconds", secs: 20 },
  { label: "30 Seconds", secs: 30 },
  { label: "45 Seconds", secs: 45 },
  { label: "60 Seconds", secs: 60 },
];

export const MIN_PLAYERS_OPTIONS = [2, 3, 4, 5, 6] as const;

// ---- public-game browser filters -------------------------------------------

export type StakeTier = "low" | "medium" | "high";

export const STAKE_TIERS: Array<{ value: StakeTier; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const GAME_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "holdem", label: "Texas Hold'em" },
  { value: "plo", label: "Pot-Limit Omaha" },
];

/** Classify a table into a stakes tier by its big blind (minor units / cents). */
export function classifyStakes(bigBlindMinor: number): StakeTier {
  if (bigBlindMinor >= 50_000) return "high"; // >= $500 BB
  if (bigBlindMinor >= 1_000) return "medium"; // >= $10 BB
  return "low";
}

/** Parsed shape of a holdem match `label` (see backend-core buildLabel). */
export interface MatchLabel {
  room_id?: string;
  sb?: number;
  bb?: number;
  seated?: number;
  open_seats?: number;
  variant?: string;
  host?: string;
}

export function parseMatchLabel(label?: string): MatchLabel | null {
  if (!label) return null;
  try {
    return JSON.parse(label) as MatchLabel;
  } catch {
    return null;
  }
}

/** Project live `table_list` items (with JSON labels) into browser/list rows. */
export function rowsFromLiveTables(
  tables: Array<{ match_id: string; room_id?: string; label?: string; seated?: number; open_seats?: number }>,
): PublicTableRow[] {
  return tables.map((t) => {
    const label = parseMatchLabel(t.label);
    const seated = label?.seated ?? t.seated ?? 0;
    const open = label?.open_seats ?? t.open_seats ?? Math.max(0, 10 - seated);
    return {
      match_id: t.match_id,
      name: label?.room_id || t.room_id || t.label || "Hold'em Table",
      seated,
      capacity: seated + open || 10,
      buy_in_minor: 100_000,
      small_blind_minor: label?.sb,
      big_blind_minor: label?.bb,
      variant: label?.variant,
      host: label?.host || "Table Host",
      live: true,
    };
  });
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
  { match_id: "demo-hrce", name: "High Rollers Club Elite", seated: 5, capacity: 10, buy_in_minor: 100000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-prestige-room", name: "Prestige Poker Room", seated: 5, capacity: 10, buy_in_minor: 100000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-diamond-1", name: "Diamond Flush", seated: 5, capacity: 10, buy_in_minor: 100000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-prestige", name: "Prestige Poker", seated: 5, capacity: 10, buy_in_minor: 100000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-diamond-2", name: "Diamond Flush", seated: 5, capacity: 10, buy_in_minor: 100000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-vault", name: "Neon Vault VIP", seated: 3, capacity: 9, buy_in_minor: 50000, small_blind_minor: 5000, big_blind_minor: 10000, variant: "plo", host: "Club Owner", demo: true },
];

// Classic Public Game Browser (detailed_13) demo grid — spans low/medium/high
// stakes and both variants so the filters have something to act on offline.
export const DEMO_BROWSER_TABLES: PublicTableRow[] = [
  { match_id: "demo-b1", name: "High Stakes Elite", seated: 7, capacity: 10, buy_in_minor: 200000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-b2", name: "Prestige Room", seated: 7, capacity: 10, buy_in_minor: 200000, small_blind_minor: 10000, big_blind_minor: 20000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-b3", name: "Diamond Flush", seated: 4, capacity: 9, buy_in_minor: 100000, small_blind_minor: 500, big_blind_minor: 1000, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-b4", name: "Neon Vault VIP", seated: 6, capacity: 8, buy_in_minor: 500000, small_blind_minor: 50000, big_blind_minor: 100000, variant: "plo", host: "Club Owner", demo: true },
  { match_id: "demo-b5", name: "Grinder's Corner", seated: 3, capacity: 9, buy_in_minor: 20000, small_blind_minor: 100, big_blind_minor: 200, variant: "holdem", host: "Club Owner", demo: true },
  { match_id: "demo-b6", name: "Omaha Splash", seated: 5, capacity: 6, buy_in_minor: 80000, small_blind_minor: 2500, big_blind_minor: 5000, variant: "plo", host: "Club Owner", demo: true },
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

/** Client-side join code the host can auto-generate before creating the table. */
export function generateJoinCode(): string {
  return demoRoomCode();
}

export function normalizeTournaments(raw: unknown): TournamentLite[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { tournaments?: unknown }).tournaments;
  return Array.isArray(list) ? (list as TournamentLite[]) : [];
}

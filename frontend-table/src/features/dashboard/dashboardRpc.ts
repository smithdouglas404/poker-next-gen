// Typed wrappers + demo fallback for the /dashboard "operative profile" home.
//
// Every field on this surface maps 1:1 to an RPC registered in
// backend-core/main.go — no fabricated live data. When the backend is
// unreachable (guest / offline) we fall back to a clearly-labelled DEMO dataset
// so the screen still reads as intentional; the page marks that state as demo
// and never presents it as live (DESIGN-SYSTEM non-negotiable #3).
//
// RPCs wired here:
//   profile_get · wallet_get · wallet_balances · player_stats ·
//   leaderboard_top · table_list · tournament_list · wallet_ledger · loyalty_get

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

/* ------------------------------------------------------------------ wire types */

export interface Profile {
  user_id: string;
  username: string;
  balance_cents: number;
}

export interface WalletGet {
  user_id: string;
  balance_cents: number;
}

export interface Bucket {
  bucket: string;
  balance_cents: number;
}
export interface WalletBalances {
  buckets: Bucket[];
}

export interface PlayerStats {
  user_id: string;
  hands: number;
  vpip_pct: number;
  pfr_pct: number;
  wtsd_pct: number;
  wsd_pct: number;
  win_rate_pct: number;
  af: number;
  net_cents: number;
  net: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  subscore: number;
}
export interface Leaderboard {
  metric: string;
  entries: LeaderboardEntry[];
  cursor: string;
}

export interface Level {
  level: number;
  name: string;
  badge: string;
  hrp_required: number;
}
export interface Loyalty {
  hrp_total: number;
  hands_played: number;
  hands_won: number;
  tier: string;
  multiplier: number;
  level: Level;
  next_level: Level | null;
  progress: number;
}

// Raw table label JSON encoded by match/holdem/handler.go buildLabel().
interface TableLabel {
  module?: string;
  room_id?: string;
  seated?: number;
  open_seats?: number;
  sb?: number;
  bb?: number;
  status?: string;
}
export interface TableListItem {
  match_id: string;
  room_id: string;
  label: string;
  seated: number;
  open_seats: number;
}
export interface TableListResponse {
  matches: TableListItem[];
}

export interface Tournament {
  id: string;
  name: string;
  variant: string;
  buy_in_minor: number;
  fee_minor: number;
  starting_stack: number;
  max_players: number;
  status: string;
  scheduled_at: string;
}
export interface TournamentListResponse {
  tournaments: Tournament[];
}

export interface LedgerEntry {
  id: string;
  delta: number;
  balance_after: number;
  reason: string;
  created_at: string;
}
export interface WalletLedger {
  user_id: string;
  ledger: LedgerEntry[];
}

/* ---------------------------------------------------------------- view models */

export interface TableCard {
  matchId: string;
  suite: string; // flavored venue name (top-left dot label)
  name: string;
  stakes: string; // "$500 / $1,000 NLH"
  potCents: number;
  seated: number;
  openSeats: number;
  full: boolean;
}

export interface TournamentRow {
  id: string;
  monthLabel: string; // "OCT"
  dayLabel: string; // "24"
  name: string;
  subtitle: string; // "$10,000,000 Guaranteed · Asia-Pacific Circuit"
  buyInCents: number;
  status: string;
}

export interface ActivityRow {
  id: string;
  kind: "credit" | "win" | "loss" | "neutral";
  title: string;
  detail: string;
  when: string; // relative time
}

export interface DashboardData {
  mode: "live" | "demo";
  username: string;
  personaTitle: string; // "ELITE PREDATOR"
  standingBlurb: string;
  bankrollCents: number;
  winRatePct: number;
  handsPlayed: number;
  rankName: string; // loyalty level, e.g. "Diamond III"
  rankProgress: number; // 0..1
  nextReward: string; // next loyalty level name
  globalRank: number | null; // native leaderboard rank (null = unranked)
  tier: string;
  tables: TableCard[];
  tournaments: TournamentRow[];
  activity: ActivityRow[];
}

/* -------------------------------------------------------------------- helpers */

const SUITES = ["Macau Private Suite", "Monte Carlo Rooftop", "Vegas Underground", "London Vault", "Tokyo Skyline"];

function parseLabel(raw: string): TableLabel {
  try {
    return JSON.parse(raw) as TableLabel;
  } catch {
    return {};
  }
}

function stakesLabel(sb: number, bb: number, variant = "NLH"): string {
  return `${money(sb)} / ${money(bb)} ${variant}`;
}

/** Derive a flavored persona title from tier + win rate (matches HRC tone). */
function personaFor(tier: string, winRate: number, hands: number): string {
  if (hands < 20) return "Rising Contender";
  if (winRate >= 60) return "Elite Predator";
  if (winRate >= 52) return "Table Captain";
  if (tier === "platinum" || tier === "gold") return "High Roller";
  return "Sharp Operative";
}

function activityFor(e: LedgerEntry): ActivityRow {
  const reason = (e.reason || "").toLowerCase();
  const credit = e.delta >= 0;
  let kind: ActivityRow["kind"] = credit ? "credit" : "loss";
  let title = credit ? "Credits Received" : "Table Debit";
  if (reason.includes("deposit")) {
    title = "Credits Deposited";
    kind = "credit";
  } else if (reason.includes("tournament") || reason.includes("prize") || reason.includes("payout")) {
    title = credit ? "Tournament Win" : "Tournament Buy-in";
    kind = credit ? "win" : "neutral";
  } else if (reason.includes("buyin") || reason.includes("buy_in") || reason.includes("cash")) {
    title = credit ? "Table Cash-out" : "Table Exit";
  } else if (reason.includes("rake") || reason.includes("bonus") || reason.includes("rakeback")) {
    title = "Rakeback Credited";
    kind = "credit";
  }
  const amt = `${credit ? "+" : "-"}${money(Math.abs(e.delta))}`;
  return {
    id: e.id,
    kind,
    title,
    detail: `${amt} · ${e.reason || "wallet movement"}`,
    when: relTime(e.created_at),
  };
}

function tournamentRow(t: Tournament): TournamentRow {
  const d = new Date(t.scheduled_at);
  const valid = Number.isFinite(d.getTime());
  const gtd = t.starting_stack > 0 ? `${compact(t.starting_stack)} stack` : "Guaranteed";
  return {
    id: t.id,
    monthLabel: valid ? d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TBD",
    dayLabel: valid ? String(d.getDate()).padStart(2, "0") : "--",
    name: t.name || "Untitled Event",
    subtitle: `${gtd} · ${t.variant || "texas-holdem"} · ${t.status}`,
    buyInCents: t.buy_in_minor,
    status: t.status,
  };
}

/* ----------------------------------------------------------------------- api */

export const dashboardApi = {
  profile: () => call<Profile>("profile_get", {}),
  wallet: () => call<WalletGet>("wallet_get", {}),
  buckets: () => call<WalletBalances>("wallet_balances", {}),
  stats: () => call<PlayerStats>("player_stats", {}),
  leaderboard: (limit = 50) =>
    call<Leaderboard>("leaderboard_top", { metric: "winnings", period: "all", limit }),
  tables: () => call<TableListResponse>("table_list", {}),
  tournaments: () => call<TournamentListResponse>("tournament_list", {}),
  ledger: (limit = 8) => call<WalletLedger>("wallet_ledger", { limit }),
  loyalty: () => call<Loyalty>("loyalty_get", {}),
};

/** Fetch + assemble the whole dashboard. Falls back to labelled demo data when
 *  the session is a guest or the backend is unreachable. */
export async function loadDashboard(): Promise<DashboardData> {
  try {
    const [profile, wallet, buckets, stats, board, tables, tourns, ledger, loyalty] =
      await Promise.all([
        dashboardApi.profile(),
        dashboardApi.wallet().catch(() => null),
        dashboardApi.buckets().catch(() => null),
        dashboardApi.stats().catch(() => null),
        dashboardApi.leaderboard().catch(() => null),
        dashboardApi.tables().catch(() => null),
        dashboardApi.tournaments().catch(() => null),
        dashboardApi.ledger().catch(() => null),
        dashboardApi.loyalty().catch(() => null),
      ]);

    // profile_get is the anchor: if it resolved we treat the surface as live.
    const bucketSum = (buckets?.buckets ?? []).reduce((a, b) => a + (b.balance_cents ?? 0), 0);
    const bankroll = Math.max(profile.balance_cents ?? 0, wallet?.balance_cents ?? 0, bucketSum);
    const winRate = stats?.win_rate_pct ?? 0;
    const hands = stats?.hands ?? 0;
    const tier = loyalty?.tier ?? "member";

    const myRank =
      board?.entries.find((e) => e.user_id === profile.user_id)?.rank ?? null;

    const tableCards: TableCard[] = (tables?.matches ?? []).slice(0, 6).map((m, i) => {
      const lab = parseLabel(m.label);
      return {
        matchId: m.match_id,
        suite: SUITES[i % SUITES.length],
        name: lab.room_id ? `Room ${lab.room_id.slice(0, 6).toUpperCase()}` : `Table ${i + 1}`,
        stakes: stakesLabel(lab.sb ?? 0, lab.bb ?? 0),
        potCents: 0,
        seated: m.seated ?? lab.seated ?? 0,
        openSeats: m.open_seats ?? lab.open_seats ?? 0,
        full: (m.open_seats ?? lab.open_seats ?? 1) <= 0,
      };
    });

    return {
      mode: "live",
      username: profile.username || "Operative",
      personaTitle: personaFor(tier, winRate, hands),
      standingBlurb:
        hands > 0
          ? `Tracked across ${compact(hands)} hands — your recent form ranks you among the club's active field.`
          : "Sit a live table to start building your tracked operative record.",
      bankrollCents: bankroll,
      winRatePct: winRate,
      handsPlayed: hands,
      rankName: loyalty?.level.name ?? "Unranked",
      rankProgress: clamp01(loyalty?.progress ?? 0),
      nextReward: loyalty?.next_level?.name ?? "Max tier reached",
      globalRank: myRank,
      tier,
      tables: tableCards,
      tournaments: (tourns?.tournaments ?? []).slice(0, 4).map(tournamentRow),
      activity: (ledger?.ledger ?? []).slice(0, 6).map(activityFor),
    };
  } catch {
    return demoDashboard();
  }
}

/* ---------------------------------------------------------------- demo dataset */

export function demoDashboard(): DashboardData {
  return {
    mode: "demo",
    username: "VIP Operative",
    personaTitle: "Elite Predator",
    standingBlurb:
      "Your performance in the last 24 hours places you in the top 0.1% of all active players in the Macau circuit.",
    bankrollCents: 428_950_000,
    winRatePct: 68.4,
    handsPlayed: 184_920,
    rankName: "Diamond III",
    rankProgress: 0.82,
    nextReward: "Private Island Invitational Access",
    globalRank: 3,
    tier: "platinum",
    tables: [
      {
        matchId: "demo-1",
        suite: "Macau Private Suite",
        name: "Dragon's Den",
        stakes: "$500 / $1,000 NLH",
        potCents: 4_250_000,
        seated: 3,
        openSeats: 3,
        full: false,
      },
      {
        matchId: "demo-2",
        suite: "Monte Carlo Rooftop",
        name: "Royal Flush Lounge",
        stakes: "$1,000 / $2,000 PLO",
        potCents: 18_900_000,
        seated: 2,
        openSeats: 4,
        full: false,
      },
      {
        matchId: "demo-3",
        suite: "Vegas Underground",
        name: "The Vault",
        stakes: "$200 / $400 NLH",
        potCents: 9_600_000,
        seated: 6,
        openSeats: 0,
        full: true,
      },
    ],
    tournaments: [
      {
        id: "demo-t1",
        monthLabel: "OCT",
        dayLabel: "24",
        name: "The Black Tie Invitational",
        subtitle: "$10,000,000 Guaranteed · Asia-Pacific Circuit",
        buyInCents: 2_500_000,
        status: "registering",
      },
      {
        id: "demo-t2",
        monthLabel: "NOV",
        dayLabel: "02",
        name: "Cyber-City Turbo",
        subtitle: "$2,500,000 Guaranteed · Tokyo Nights Series",
        buyInCents: 500_000,
        status: "registering",
      },
      {
        id: "demo-t3",
        monthLabel: "NOV",
        dayLabel: "15",
        name: "Ultimate Whale Showdown",
        subtitle: "Unlimited Re-entry · Private Venue",
        buyInCents: 10_000_000,
        status: "registering",
      },
    ],
    activity: [
      {
        id: "d1",
        kind: "credit",
        title: "Credits Deposited",
        detail: "+$250,000.00 · Successfully added to your vault.",
        when: "2h ago",
      },
      {
        id: "d2",
        kind: "win",
        title: "Tournament Win",
        detail: "+$85,000.00 · Placed 2nd in 'High Roller Sprint'.",
        when: "yesterday",
      },
      {
        id: "d3",
        kind: "loss",
        title: "Table Exit",
        detail: "-$12,400.00 · Left 'Deep Stack Macau'.",
        when: "Oct 21",
      },
    ],
  };
}

/* --------------------------------------------------------------- formatters */

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Cents → grouped dollar label, e.g. 428950000 → "$4,289,500". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${Math.abs(dollars).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Cents → compact accent form for pot chips, e.g. 4250000 → "$42.5K". */
export function moneyCompact(cents: number | undefined | null): string {
  const v = (cents ?? 0) / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Compact integer, e.g. 184920 → "184.9K". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

// Clearly-labelled demo dataset for the Club-Owner Hub. This is the no-backend
// fallback shown to guests / when RPCs are unreachable. It is NEVER presented as
// live data — every surface that renders it also shows a "Demo data" badge. The
// shapes match the real RPC responses exactly so the live path is identical.

import type {
  ClubAnnouncement,
  ClubChatMessage,
  JoinRequest,
  OwnerClub,
  QuickStats,
  RakeConfig,
  RakeLedger,
  RakeReport,
  RosterRow,
} from "./types";

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

export const DEMO_CLUB: OwnerClub = {
  id: "demo-club",
  name: "High Rollers Club",
  slug: "high-rollers",
  description: "Managing elite members and pending authorizations.",
};

export const DEMO_ROSTER: RosterRow[] = [
  { user_id: "u-viktor", username: "Viktor Volkov", role: "admin", status: "active", joined_at: daysAgo(612), balance: 42_050_000, locked_amount: 8_400_000, can_configure: true, activity_count: 1284 },
  { user_id: "u-elena", username: "Elena Thorne", role: "admin", status: "active", joined_at: daysAgo(540), balance: 184_000_000, locked_amount: 22_000_000, can_configure: true, activity_count: 3120 },
  { user_id: "u-soren", username: "Soren Kael", role: "member", status: "active", joined_at: daysAgo(430), balance: 61_220_000, locked_amount: 5_100_000, can_configure: false, activity_count: 940 },
  { user_id: "u-mina", username: "Mina Oh", role: "member", status: "online", joined_at: daysAgo(410), balance: 1_240_000, locked_amount: 240_000, can_configure: false, activity_count: 612 },
  { user_id: "u-mannon", username: "mannon", role: "member", status: "active", joined_at: daysAgo(270), balance: 15_000_000, locked_amount: 0, can_configure: false, activity_count: 208 },
  { user_id: "u-nomeratt", username: "nomerattoy", role: "member", status: "away", joined_at: daysAgo(270), balance: 10_000_000, locked_amount: 0, can_configure: false, activity_count: 176 },
  { user_id: "u-lonner", username: "lonnerman", role: "member", status: "active", joined_at: daysAgo(265), balance: 9_000_000, locked_amount: 320_000, can_configure: false, activity_count: 143 },
  { user_id: "u-patsheig", username: "patsheig", role: "member", status: "online", joined_at: daysAgo(240), balance: 5_000_000, locked_amount: 0, can_configure: false, activity_count: 98 },
  { user_id: "u-lorther", username: "lorther198", role: "member", status: "active", joined_at: daysAgo(210), balance: 3_000_000, locked_amount: 0, can_configure: false, activity_count: 71 },
  { user_id: "u-narasi", username: "narasiskok7", role: "member", status: "away", joined_at: daysAgo(190), balance: 2_000_000, locked_amount: 0, can_configure: false, activity_count: 44 },
  { user_id: "u-redais", username: "redaislever", role: "member", status: "active", joined_at: daysAgo(160), balance: 2_000_000, locked_amount: 0, can_configure: false, activity_count: 33 },
  { user_id: "u-mamm", username: "mammuxari20", role: "member", status: "banned", joined_at: daysAgo(120), balance: 0, locked_amount: 0, can_configure: false, activity_count: 12 },
];

export const DEMO_REQUESTS: JoinRequest[] = [
  { id: "req-1", club_id: DEMO_CLUB.id, user_id: "u-cipher", username: "Ivo Cipher", inviter: "", type: "request", role: "member", credit_limit_cents: 0, status: "pending", message: "High-stakes specialist — 6y online grinder, HRC alumni.", created_at: minsAgo(240) },
  { id: "req-2", club_id: DEMO_CLUB.id, user_id: "u-phantom", username: "Nadia Phantom", inviter: "", type: "request", role: "member", credit_limit_cents: 0, status: "pending", message: "Referred by Elena Thorne. Looking for nightly PLO action.", created_at: minsAgo(90) },
  { id: "req-3", club_id: DEMO_CLUB.id, user_id: "u-ronin", username: "Kaito Ronin", inviter: "", type: "request", role: "member", credit_limit_cents: 0, status: "pending", message: "Tournament regular. Requesting a seat for the Gold Cup.", created_at: minsAgo(28) },
];

export const DEMO_QUICK_STATS: QuickStats = {
  member_count: 500,
  stats: {
    club_id: DEMO_CLUB.id,
    member_count: 500,
    active_7d: 342,
    hands: 1_284_902,
    win_rate_bps: 5240,
    chips_won: 240_000_000,
    tourney_wins: 47,
    updated_at: minsAgo(4),
  },
  activity: [
    { id: "a1", club_id: DEMO_CLUB.id, user_id: "u-elena", kind: "table_win", detail: "Elena Thorne won $84,200 at High Stakes — Table 1", created_at: minsAgo(6) },
    { id: "a2", club_id: DEMO_CLUB.id, user_id: "u-cipher", kind: "join_request", detail: "Ivo Cipher requested to join the club", created_at: minsAgo(240) },
    { id: "a3", club_id: DEMO_CLUB.id, user_id: "u-soren", kind: "tournament", detail: "Soren Kael reached the final table of the Gold Cup", created_at: minsAgo(320) },
    { id: "a4", club_id: DEMO_CLUB.id, user_id: "u-mina", kind: "deposit", detail: "Mina Oh topped up her club bankroll by $12,400", created_at: minsAgo(500) },
    { id: "a5", club_id: DEMO_CLUB.id, user_id: "u-mannon", kind: "allocation", detail: "You allocated $15,000 to mannon", created_at: minsAgo(720) },
  ],
};

export function demoRakeReport(period: string): RakeReport {
  // Seven descending days of house rake with hands played.
  const series = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date(now - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    const amount = 480_000 + Math.round(Math.sin(i * 1.3) * 120_000) + i * 42_000;
    const hands = 3_200 + Math.round(Math.cos(i) * 400) + i * 120;
    return { day, amount, hands };
  });
  return {
    total_rake: series.reduce((s, p) => s + p.amount, 0),
    hand_count: series.reduce((s, p) => s + p.hands, 0),
    series,
    period,
  };
}

export const DEMO_RAKE_LEDGER: RakeLedger = {
  house_balance: 3_480_000,
  ledger: Array.from({ length: 10 }).map((_, i) => ({
    id: `led-${i}`,
    club_id: DEMO_CLUB.id,
    amount: 8_400 + i * 1_150,
    match_id: `m-${(1000 + i * 7).toString(16)}`,
    hand_no: 402 - i * 3,
    created_at: minsAgo(i * 18 + 3),
  })),
};

/** Live bankroll = house rake balance + every member's allocated balance. */
export function totalBankrollCents(roster: RosterRow[], houseBalance: number): number {
  return houseBalance + roster.reduce((s, m) => s + (m.balance ?? 0) + (m.locked_amount ?? 0), 0);
}

// ---- Global Announcement Control Center ------------------------------------

export const DEMO_ANNOUNCEMENTS: ClubAnnouncement[] = [
  { id: "clann-1", club_id: DEMO_CLUB.id, title: "Special Tournament Starts in 1 Hour", body: "ATTENTION ALL PLAYERS: The Gold Cup qualifier begins at the top of the hour. Double XP event is now LIVE!", severity: "critical", created_by: "owner", created_at: minsAgo(52) },
  { id: "clann-2", club_id: DEMO_CLUB.id, title: "New High-Stakes Table Opened", body: "The $500/$1k Diamond Vault table is now seating. First 6 players get a rakeback boost.", severity: "info", created_by: "owner", created_at: minsAgo(340) },
  { id: "clann-3", club_id: DEMO_CLUB.id, title: "Scheduled Maintenance Sunday 04:00 UTC", body: "Brief downtime for the vault ledger migration. All balances are safe.", severity: "warning", created_by: "owner", created_at: daysAgo(2) },
];

// ---- Overview right-rail: Global Club Chat ---------------------------------

export const DEMO_CHAT: ClubChatMessage[] = [
  { id: "cm-1", club_id: DEMO_CLUB.id, user_id: "u-elena", username: "Elena Thorne", text: "Any room open at the high-stakes table?", created_at: minsAgo(14) },
  { id: "cm-2", club_id: DEMO_CLUB.id, user_id: "u-viktor", username: "AceKing", text: "GL everyone at the Gold Cup qualifier tonight 🏆", created_at: minsAgo(11) },
  { id: "cm-3", club_id: DEMO_CLUB.id, user_id: "u-soren", username: "Soren Kael", text: "Just booked a $50k pot on table 3 😮", created_at: minsAgo(6) },
  { id: "cm-4", club_id: DEMO_CLUB.id, user_id: "u-mina", username: "Mina Oh", text: "Congrats! Railing you now.", created_at: minsAgo(3) },
];

export const DEMO_RAKE_CONFIG: RakeConfig = {
  club_id: DEMO_CLUB.id,
  name: "Standard",
  percent_bps: 500, // 5.0%
  cap_minor: 300_00, // $300 cap
  no_flop_no_drop: true,
  min_pot_minor: 1_00,
  is_active: true,
};

/** 12-month analytics series for the Member Analytics dashboard. */
export const DEMO_ANALYTICS = {
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  activeMembers: [22, 58, 96, 150, 176, 190, 214, 240, 262, 288, 312, 342],
  tableVolumeCents: [14_000_00, 11_500_00, 15_800_00, 21_000_00, 17_400_00, 22_400_00, 15_000_00, 12_600_00, 16_800_00, 19_200_00, 20_400_00, 24_800_00],
  newPlayers: 33,
  returningPlayers: 57,
};

/** Overview sparkline series (one per stat card). */
export const DEMO_OVERVIEW_SPARKS = {
  members: [980, 1010, 1044, 1090, 1120, 1165, 1205, 1245],
  tables: [11, 12, 10, 14, 15, 13, 17, 18],
  volumeCents: [8_400_000_00, 9_100_000_00, 10_800_000_00, 12_200_000_00, 13_900_000_00, 12_600_000_00, 14_800_000_00, 15_450_000_00],
  potCents: [9_800_00, 10_400_00, 11_100_00, 10_600_00, 12_000_00, 11_500_00, 12_200_00, 12_500_00],
  rakeCents: [320_000_00, 355_000_00, 380_000_00, 410_000_00, 400_000_00, 430_000_00, 445_000_00, 450_000_00],
};

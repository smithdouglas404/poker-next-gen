// Typed wrappers + local shapes + demo datasets for the four standalone
// club-owner sub-pages (sponsorship payouts, member invite flow, revenue
// reports, invitation system). Every wrapper maps 1:1 to an RPC registered in
// backend-core/main.go. The demo datasets share the exact JSON shape of the
// live responses so the render path is identical offline and online, and every
// surface that shows them also renders a "Demo data" badge.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

// ---- Shapes (mirror backend-core store structs) ----------------------------

/** poker_settlement row — store.AdminSettlement (admin.go). */
export interface Settlement {
  id: string;
  kind: string;
  reference: string;
  counterparty: string; // recipient wallet / account
  amount_cents: number;
  currency: string;
  status: string; // pending | verified
  note: string;
  created_by: string;
  created_at: string;
  verified_at: string | null;
}

/** store.AdminFinancials (admin.go). */
export interface AdminFinancials {
  deposits_credited_cents: number;
  withdrawals_paid_cents: number;
  withdrawals_pending_cents: number;
  wallet_float_cents: number;
  rake_collected_cents: number;
  user_count: number;
  banned_count: number;
}

/** club_requests_list row (also carries invites). */
export interface ClubInvitation {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  inviter: string;
  type: "invite" | "request";
  role: string;
  credit_limit_cents: number;
  status: string; // pending | sent | accepted | expired | declined
  message: string;
  created_at: string;
}

// ---- Live RPC wrappers ------------------------------------------------------

export const screensApi = {
  // Sponsorship payouts (admin-gated). Falls back to demo on 403 / offline.
  sponsorshipList: (status = "", limit = 100) =>
    call<{ payouts?: Settlement[] }>("sponsorship_payout_list", { status, limit }),
  sponsorshipCreate: (counterparty: string, amountCents: number, note = "", reference = "") =>
    call<{ id: string; status: string }>("sponsorship_payout_create", {
      counterparty,
      amount_cents: amountCents,
      currency: "USD",
      reference,
      note,
    }),

  // Invites.
  invite: (opts: {
    clubId: string;
    userId: string;
    username?: string;
    role?: string;
    creditLimitCents?: number;
    message?: string;
  }) =>
    call<{ ok: boolean; invitation_id: string }>("club_invite", {
      club_id: opts.clubId,
      user_id: opts.userId,
      username: opts.username ?? opts.userId,
      role: opts.role ?? "member",
      credit_limit_cents: opts.creditLimitCents ?? 0,
      message: opts.message ?? "",
    }),
  /** Allocate initial club credit to a member's balance. */
  allocateBalance: (clubId: string, userId: string, amountCents: number) =>
    call<unknown>("balance_allocate", {
      club_id: clubId,
      user_id: userId,
      amount: amountCents,
      currency: "USD",
    }),
  /** Pending + recent invitations for a club (club_requests_list). */
  invites: (clubId: string, status = "") =>
    call<{ requests?: ClubInvitation[] }>("club_requests_list", {
      club_id: clubId,
      status,
    }),

  // Revenue.
  rakeReport: (clubId: string, period: string) =>
    call<{ total_rake: number; hand_count: number; series?: RakeDay[]; period: string }>(
      "club_rake_report",
      { club_id: clubId, period },
    ),
  rakeLedger: (clubId: string) =>
    call<{ house_balance: number; ledger: RakeEntry[] | null }>("rake_ledger_get", {
      club_id: clubId,
    }),
  financials: () => call<{ financials?: AdminFinancials }>("admin_financials", {}),
};

export interface RakeDay {
  day: string;
  amount: number;
  hands: number;
}
export interface RakeEntry {
  id: string;
  club_id: string;
  amount: number;
  match_id: string;
  hand_no: number;
  created_at: string;
}

// ---- Formatters -------------------------------------------------------------

export function usd(cents: number | undefined | null): string {
  return `$${Math.round((cents ?? 0) / 100).toLocaleString("en-US")}`;
}
export function usdCompact(cents: number | undefined | null): string {
  const d = (cents ?? 0) / 100;
  const a = Math.abs(d);
  if (a >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
  return `$${d.toFixed(0)}`;
}
export function shortWallet(w: string): string {
  if (!w) return "—";
  if (w.length <= 12 || w.includes("@")) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
export function dateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export function dateOnly(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---- Demo datasets ----------------------------------------------------------

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

export const DEMO_PAYOUTS: Settlement[] = [
  { id: "TX-001234", kind: "sponsorship", reference: "SPR-OCT-1", counterparty: "0xAbC1a3F9d0E23eF", amount_cents: 1_500_000_00, currency: "USD", status: "verified", note: "Weekly sponsorship", created_by: "owner", created_at: daysAgo(1), verified_at: daysAgo(1) },
  { id: "TX-001235", kind: "sponsorship", reference: "SPR-OCT-2", counterparty: "0xDfE4b7c210A56gH", amount_cents: 2_250_000_00, currency: "USD", status: "verified", note: "Tournament sponsor", created_by: "owner", created_at: daysAgo(2), verified_at: daysAgo(2) },
  { id: "TX-001236", kind: "sponsorship", reference: "SPR-OCT-3", counterparty: "0xAbC1a3F9d0E23eF", amount_cents: 1_500_000_00, currency: "USD", status: "verified", note: "Weekly sponsorship", created_by: "owner", created_at: daysAgo(2), verified_at: daysAgo(2) },
  { id: "TX-001237", kind: "sponsorship", reference: "SPR-OCT-4", counterparty: "0xDfE4b7c210A56gH", amount_cents: 2_250_000_00, currency: "USD", status: "verified", note: "Tournament sponsor", created_by: "owner", created_at: daysAgo(3), verified_at: daysAgo(3) },
  { id: "TX-001238", kind: "sponsorship", reference: "SPR-OCT-5", counterparty: "0xAbC1a3F9d0E23eF", amount_cents: 1_500_000_00, currency: "USD", status: "pending", note: "Weekly sponsorship", created_by: "owner", created_at: daysAgo(3), verified_at: null },
  { id: "TX-001239", kind: "sponsorship", reference: "SPR-OCT-6", counterparty: "0xDfE4b7c210A56gH", amount_cents: 2_250_000_00, currency: "USD", status: "pending", note: "Tournament sponsor", created_by: "owner", created_at: daysAgo(4), verified_at: null },
  { id: "TX-001230", kind: "sponsorship", reference: "SPR-OCT-7", counterparty: "0xAbC1a3F9d0E23eF", amount_cents: 1_500_000_00, currency: "USD", status: "verified", note: "Weekly sponsorship", created_by: "owner", created_at: daysAgo(5), verified_at: daysAgo(5) },
];

export const DEMO_INVITES: ClubInvitation[] = [
  { id: "inv-1", club_id: "demo-club", user_id: "john.doe@example.com", username: "john.doe@example.com", inviter: "owner", type: "invite", role: "member", credit_limit_cents: 1_000_000_00, status: "sent", message: "", created_at: daysAgo(8) },
  { id: "inv-2", club_id: "demo-club", user_id: "0xAbC1a3F9d0E23eF", username: "0xAbC1a3F9d0E23eF", inviter: "owner", type: "invite", role: "vip", credit_limit_cents: 5_000_000_00, status: "accepted", message: "", created_at: daysAgo(10) },
  { id: "inv-3", club_id: "demo-club", user_id: "jane.smith@example.com", username: "jane.smith@example.com", inviter: "owner", type: "invite", role: "member", credit_limit_cents: 1_000_000_00, status: "expired", message: "", created_at: daysAgo(21) },
  { id: "inv-4", club_id: "demo-club", user_id: "0xDfE4b7c210A56gH", username: "0xDfE4b7c210A56gH", inviter: "owner", type: "invite", role: "vip", credit_limit_cents: 2_500_000_00, status: "sent", message: "", created_at: daysAgo(2) },
];

export function demoRakeReport(period: string): {
  total_rake: number;
  hand_count: number;
  series: RakeDay[];
  period: string;
} {
  const series = Array.from({ length: 30 }).map((_, i) => {
    const day = new Date(now - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const base = 80_000_00 + i * 12_000_00;
    const amount = Math.round(base + Math.sin(i * 0.9) * 40_000_00);
    const hands = 3_000 + Math.round(Math.cos(i) * 500) + i * 60;
    return { day, amount, hands };
  });
  return {
    total_rake: 120_000_00,
    hand_count: series.reduce((s, p) => s + p.hands, 0),
    series,
    period,
  };
}

export const DEMO_FINANCIALS: AdminFinancials = {
  deposits_credited_cents: 500_000_00,
  withdrawals_paid_cents: 150_000_00,
  withdrawals_pending_cents: 12_000_00,
  wallet_float_cents: 350_000_00,
  rake_collected_cents: 120_000_00,
  user_count: 500,
  banned_count: 3,
};

export const DEMO_REVENUE_LOG: Array<{
  date: string;
  source: string;
  amount: number;
  status: string;
}> = [
  { date: hoursAgo(3), source: "Cash Game Rake", amount: 2_500_00, status: "cleared" },
  { date: hoursAgo(20), source: "Tournament Fees", amount: 1_200_00, status: "cleared" },
  { date: hoursAgo(22), source: "Cash Game Rake", amount: 1_800_00, status: "cleared" },
  { date: daysAgo(2), source: "Tournament Fees", amount: 1_400_00, status: "cleared" },
  { date: daysAgo(2), source: "Cash Game Rake", amount: 3_100_00, status: "cleared" },
  { date: daysAgo(3), source: "Sponsorship", amount: 15_000_00, status: "pending" },
  { date: daysAgo(3), source: "Cash Game Rake", amount: 2_050_00, status: "cleared" },
];

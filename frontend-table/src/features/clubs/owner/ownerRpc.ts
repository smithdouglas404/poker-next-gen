// Typed wrappers over callSessionRpc for the Club-Owner Hub. Every function maps
// 1:1 to an RPC registered in backend-core/main.go (212 registered) — no
// fabricated data flows through here. When the backend is unreachable (guest /
// offline) the caller falls back to the clearly-labelled demo dataset instead.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  ClubAnnouncement,
  ClubChatMessage,
  ClubStats,
  JoinRequest,
  OwnerClub,
  OwnerClubDetail,
  OwnerClubExt,
  QuickStats,
  RakeConfig,
  RakeLedger,
  RakeReport,
  RosterRow,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const ownerApi = {
  /** List every club (used to pick the caller's owned club). */
  list: () => call<{ clubs?: OwnerClub[] }>("club_list", {}),
  /** Club + caller membership + create fee. */
  get: (clubId: string) => call<OwnerClubDetail>("club_get", { club_id: clubId }),
  /** Basic member list. */
  members: (clubId: string) =>
    call<{ members?: RosterRow[] }>("club_members", { club_id: clubId }),
  /** Enriched roster (balance, activity, owner flags). */
  roster: (clubId: string) =>
    call<{ roster?: RosterRow[] }>("club_roster", { club_id: clubId }),
  /** Configurer-gated per-member analytics. */
  memberStats: (clubId: string) =>
    call<{ members?: RosterRow[]; club_stats?: unknown }>("club_member_stats", {
      club_id: clubId,
    }),
  /** Overview rollup: stats, live member count, recent activity feed. */
  quickStats: (clubId: string) =>
    call<QuickStats>("club_quick_stats", { club_id: clubId }),

  /** Pending join requests to approve/decline. */
  requests: (clubId: string) =>
    call<{ requests?: JoinRequest[] }>("club_requests_list", {
      club_id: clubId,
      status: "pending",
    }),
  reviewRequest: (invitationId: string, action: "approve" | "deny") =>
    call<{ ok: boolean; status: string }>("club_request_review", {
      invitation_id: invitationId,
      action,
    }),

  /** Promote/demote a member (member ⇄ admin). */
  setRole: (clubId: string, userId: string, role: "member" | "admin") =>
    call<{ ok: boolean }>("club_member_role", { club_id: clubId, user_id: userId, role }),
  /** Remove a member from the club. */
  kick: (clubId: string, userId: string) =>
    call<{ ok: boolean }>("club_kick", { club_id: clubId, user_id: userId }),
  /** Allocate club bankroll to a player (Edit → set contribution/credit). */
  allocateBalance: (clubId: string, userId: string, amountCents: number) =>
    call<unknown>("balance_allocate", {
      club_id: clubId,
      user_id: userId,
      amount: amountCents,
      currency: "USD",
    }),

  /** House rake aggregated over a period (day|week|month|quarter|year|all). */
  rakeReport: (clubId: string, period: string) =>
    call<RakeReport>("club_rake_report", { club_id: clubId, period }),
  /** House balance + recent rake ledger entries. */
  rakeLedger: (clubId: string) =>
    call<RakeLedger>("rake_ledger_get", { club_id: clubId }),

  /** Non-owner discovery: public clubs to browse/join. */
  browse: (search = "") =>
    call<{ clubs?: OwnerClub[] }>("club_browse", { search, limit: 40 }),
  joinRequest: (clubId: string, message: string) =>
    call<{ ok: boolean; request_id: string }>("club_join_request", {
      club_id: clubId,
      message,
    }),

  /** Cross-club leaderboard over poker_club_stats (analytics benchmarking). */
  rankings: (metric = "hands", limit = 20) =>
    call<{ rankings?: ClubStats[] }>("club_rankings", { metric, limit }),

  // ---- Announcements (Global Announcement Control Center) ----
  announcements: (clubId: string, limit = 30) =>
    call<{ announcements?: ClubAnnouncement[] }>("club_announcement_list", {
      club_id: clubId,
      limit,
    }),
  createAnnouncement: (clubId: string, title: string, body: string, severity: string) =>
    call<{ ok: boolean; id: string }>("club_announcement_create", {
      club_id: clubId,
      title,
      body,
      severity,
    }),

  // ---- Club chat (Overview right-rail live feed) ----
  chatList: (clubId: string, limit = 40) =>
    call<{ messages?: ClubChatMessage[] }>("club_chat_list", { club_id: clubId, limit }),
  chatSend: (clubId: string, text: string) =>
    call<{ ok: boolean; id: string }>("club_chat_send", { club_id: clubId, text }),

  // ---- Global settings: rake profile + club identity/visibility ----
  rakeConfigGet: (clubId: string) =>
    call<RakeConfig>("rake_config_get", { club_id: clubId }),
  rakeConfigSet: (cfg: RakeConfig) =>
    call<RakeConfig>("rake_config_set", { ...cfg }),
  /** Patch identity/branding/visibility. Only provided fields change server-side. */
  updateClub: (
    clubId: string,
    patch: {
      name?: string;
      description?: string;
      tag?: string;
      is_public?: boolean;
      require_approval?: boolean;
      avatar_ref?: string;
      settings_json?: Record<string, unknown>;
    },
  ) => call<{ club: OwnerClubExt }>("club_update", { club_id: clubId, ...patch }),
};

/** Cents → full dollar label, e.g. 254000000 → "$2,540,000". */
export function usd(cents: number | undefined | null): string {
  const dollars = Math.round((cents ?? 0) / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

/** Cents → compact dollar label, e.g. 4820000 → "$48.2k". */
export function usdCompact(cents: number | undefined | null): string {
  const d = (cents ?? 0) / 100;
  const abs = Math.abs(d);
  if (abs >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
  return `$${d.toFixed(0)}`;
}

/** Compact integer, e.g. 1248 → "1.2k". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

/** ISO → "Oct 25, 2023". Falls back to em dash on bad input. */
export function joinDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string | undefined | null): string {
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
  return `${d}d ago`;
}

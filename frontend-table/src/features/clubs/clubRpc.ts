// Typed wrappers over callSessionRpc for the Clubs surface. Every function here
// maps 1:1 to an RPC registered in backend-core/main.go — no fabricated data.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  Alliance,
  AllianceMember,
  Announcement,
  ChatMessage,
  Club,
  ClubDetail,
  ClubEvent,
  ClubStats,
  Invitation,
  Mission,
  QuickStats,
  RakeLedger,
  RakeReport,
  RosterRow,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const clubApi = {
  list: () => call<{ clubs?: Club[] }>("club_list", {}),
  create: (name: string) => call<Club>("club_create", { name }),
  browse: (search = "") => call<{ clubs?: Club[] }>("club_browse", { search, limit: 40 }),
  get: (clubId: string) => call<ClubDetail>("club_get", { club_id: clubId }),
  roster: (clubId: string) => call<{ roster?: RosterRow[] }>("club_roster", { club_id: clubId }),
  quickStats: (clubId: string) => call<QuickStats>("club_quick_stats", { club_id: clubId }),
  rankings: (metric = "chips_won") =>
    call<{ rankings?: ClubStats[] }>("club_rankings", { metric, limit: 20 }),
  memberStats: (clubId: string) =>
    call<{ members?: RosterRow[]; club_stats?: ClubStats | null }>("club_member_stats", {
      club_id: clubId,
    }),

  announcements: (clubId: string) =>
    call<{ announcements?: Announcement[] }>("club_announcement_list", { club_id: clubId, limit: 20 }),
  createAnnouncement: (clubId: string, title: string, body: string, severity: string) =>
    call<{ ok: boolean; id: string }>("club_announcement_create", {
      club_id: clubId,
      title,
      body,
      severity,
    }),

  events: (clubId: string) =>
    call<{ events?: ClubEvent[] }>("club_event_list", { club_id: clubId, limit: 20 }),
  createEvent: (event: {
    club_id: string;
    name: string;
    scheduled_at: string;
    small_blind: number;
    big_blind: number;
    variant: string;
    format: string;
  }) => call<{ ok: boolean; id: string }>("club_event_create", event),

  requests: (clubId: string) =>
    call<{ requests?: Invitation[] }>("club_requests_list", { club_id: clubId, status: "pending" }),
  reviewRequest: (invitationId: string, action: "approve" | "deny") =>
    call<{ ok: boolean; status: string }>("club_request_review", {
      invitation_id: invitationId,
      action,
    }),
  invitations: () => call<{ invitations?: Invitation[] }>("club_invitations_list", {}),
  invite: (clubId: string, userId: string, role: string, message: string) =>
    call<{ ok: boolean; invitation_id: string }>("club_invite", {
      club_id: clubId,
      user_id: userId,
      role,
      message,
    }),
  joinRequest: (clubId: string, message: string) =>
    call<{ ok: boolean; request_id: string }>("club_join_request", { club_id: clubId, message }),

  chatList: (clubId: string) =>
    call<{ messages?: ChatMessage[] }>("club_chat_list", { club_id: clubId, limit: 50 }),
  chatSend: (clubId: string, text: string) =>
    call<{ ok: boolean; id: string }>("club_chat_send", { club_id: clubId, text }),

  update: (
    clubId: string,
    patch: Partial<{
      name: string;
      description: string;
      tag: string;
      is_public: boolean;
      require_approval: boolean;
    }>,
  ) => call<{ club: unknown }>("club_update", { club_id: clubId, ...patch }),
  transferOwnership: (clubId: string, userId: string) =>
    call<{ ok: boolean; new_owner: string }>("club_transfer_ownership", {
      club_id: clubId,
      user_id: userId,
    }),
  remove: (clubId: string) => call<{ ok: boolean }>("club_delete", { club_id: clubId }),

  rakeReport: (clubId: string, period: string) =>
    call<RakeReport>("club_rake_report", { club_id: clubId, period }),
  rakeLedger: (clubId: string) => call<RakeLedger>("rake_ledger_get", { club_id: clubId }),

  alliance: (clubId: string) =>
    call<{ alliance: Alliance | null; members?: AllianceMember[] }>("club_alliance_get", {
      club_id: clubId,
    }),

  missions: () => call<{ missions?: Mission[] }>("missions_list", {}),
  claimMission: (missionId: string) =>
    call<{ ok: boolean }>("mission_claim", { mission_id: missionId }),
};

/** Cents → compact dollar label, e.g. 482000 → "$4.8k". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toFixed(2)}`;
}

/** Compact integer, e.g. 128700 → "128.7k". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

/** Human relative time from an ISO timestamp. */
export function relTime(iso: string): string {
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

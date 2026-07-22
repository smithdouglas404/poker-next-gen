// Typed wrappers over callSessionRpc for the Social surface. Every function here
// maps 1:1 to an RPC registered in backend-core/main.go — no fabricated data.
//   alliance_*  → rpc/alliance.go
//   league_*    → rpc/league.go
//   clubwar_*   → rpc/clubwar.go

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  Alliance,
  AllianceDetail,
  Club,
  ClubWar,
  ClubWarDetail,
  ClubWarResult,
  League,
  LeagueDetail,
  LeagueStanding,
  LeagueStatus,
  MeRoles,
} from "./types";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const socialApi = {
  // Context (existing RPCs).
  clubList: () => call<{ clubs?: Club[] }>("club_list", {}),
  meRoles: () => call<MeRoles>("me_roles", {}),

  // Alliances.
  allianceList: () => call<{ alliances?: Alliance[] }>("alliance_list", {}),
  allianceGet: (id: string) => call<AllianceDetail>("alliance_get", { id }),
  allianceCreate: (name: string, foundingClubId: string) =>
    call<Alliance>("alliance_create", { name, founding_club_id: foundingClubId }),
  allianceUpdate: (id: string, name: string) =>
    call<{ alliance: Alliance }>("alliance_update", { id, name }),
  allianceJoin: (allianceId: string, clubId: string) =>
    call<{ ok: boolean }>("alliance_join", { alliance_id: allianceId, club_id: clubId }),
  allianceRemoveClub: (allianceId: string, clubId: string) =>
    call<{ ok: boolean }>("alliance_remove_club", { alliance_id: allianceId, club_id: clubId }),
  allianceDelete: (id: string) => call<{ ok: boolean }>("alliance_delete", { id }),
  clubAllianceGet: (clubId: string) =>
    call<AllianceDetail>("club_alliance_get", { club_id: clubId }),

  // Leagues.
  leagueList: () => call<{ leagues?: League[] }>("league_list", {}),
  leagueGet: (id: string) => call<LeagueDetail>("league_get", { id }),
  leagueCreate: (name: string, startsAt: string, endsAt: string) =>
    call<League>("league_create", { name, starts_at: startsAt, ends_at: endsAt }),
  leagueUpdate: (
    id: string,
    patch: Partial<{ name: string; status: LeagueStatus; starts_at: string; ends_at: string }>,
  ) => call<{ league: League }>("league_update", { id, ...patch }),
  leagueDelete: (id: string) => call<{ ok: boolean }>("league_delete", { id }),
  leagueJoin: (leagueId: string, clubId: string) =>
    call<{ ok: boolean }>("league_join", { league_id: leagueId, club_id: clubId }),
  leagueStandingsSet: (
    leagueId: string,
    clubId: string,
    points: number,
    wins: number,
    losses: number,
  ) =>
    call<{ standings?: LeagueStanding[] }>("league_standings_set", {
      league_id: leagueId,
      club_id: clubId,
      points,
      wins,
      losses,
    }),
  leagueComplete: (id: string) =>
    call<{ ok: boolean; champion_club_id: string; standings?: LeagueStanding[] }>(
      "league_complete",
      { id },
    ),

  // Club Wars.
  clubwarList: (clubId = "", status = "") =>
    call<{ wars?: ClubWar[] }>("clubwar_list", { club_id: clubId, status }),
  clubwarGet: (id: string) => call<ClubWarDetail>("clubwar_get", { id }),
  clubwarSchedule: (clubA: string, clubB: string, scheduledAt: string) =>
    call<ClubWar>("clubwar_schedule", { club_a: clubA, club_b: clubB, scheduled_at: scheduledAt }),
  clubwarAccept: (id: string) => call<{ war: ClubWar }>("clubwar_accept", { id }),
  clubwarMatchmake: (id: string) => call<{ war: ClubWar }>("clubwar_matchmake", { id }),
  clubwarResult: (id: string, scoreA?: number, scoreB?: number) =>
    call<ClubWarResult>("clubwar_result", {
      id,
      ...(scoreA !== undefined ? { score_a: scoreA } : {}),
      ...(scoreB !== undefined ? { score_b: scoreB } : {}),
    }),
};

/** Human relative time from an ISO timestamp (past or future). */
export function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60_000);
  if (m < 1) return "just now";
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (m < 60) return fmt(m, "m");
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(h, "h");
  const d = Math.floor(h / 24);
  return fmt(d, "d");
}

/** Short calendar label, e.g. "Jul 22, 2026". */
export function dateLabel(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Convert a <input type="datetime-local"> value to an RFC3339 string, or "". */
export function localToIso(local: string): string {
  if (!local) return "";
  const t = new Date(local);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString();
}

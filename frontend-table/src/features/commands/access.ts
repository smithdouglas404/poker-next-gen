// Role-based access for the Command Center (finer club roles, hide-on-deny).
//
// This is a UX layer: it decides which commands the operator SEES in the active
// club. The backend independently enforces every action (requireClubConfigurer,
// requireTournamentOwner, isAdmin), so this must never be STRICTER than the
// server — that would hide an action the user is actually allowed to take. Each
// entry mirrors the server's real guard.

import type { MeRoles } from "./useMeRoles";
import { roleInClub } from "./useMeRoles";

export type AccessLevel =
  | "public" // anyone, signed in or not
  | "registered" // any signed-in account
  | "member" // any member of the active club
  | "configurer" // owner, or manager/agent with can_configure (server: requireClubConfigurer)
  | "owner" // club owner only
  | "platform_admin"; // global admin

// Only commands that need MORE than "registered" are listed; anything absent is
// treated as "registered" (visible to any signed-in user) unless the command's
// own `requires: platform_admin` says otherwise.
export const COMMAND_ACCESS: Record<string, AccessLevel> = {
  // Community & Clubs — operator management (server: requireClubConfigurer).
  club_owner_add: "configurer",
  balance_allocate: "configurer",
  rake_config_set: "configurer",
  club_member_role: "configurer",
  club_kick: "configurer",
  rake_ledger_get: "configurer",
  club_update: "configurer",
  club_delete: "owner",
  club_transfer_ownership: "owner",
  // Community reads — any club member.
  balance_get: "member",
  rake_config_get: "member",
  club_members: "member",
  club_roster: "member",

  // Anti-bot scoring is operator-only — never advertise the mechanics to players
  // who could probe their own detectability (P1-9).
  antibot_score: "platform_admin",
  // Ops / infra surfaces are admin-only — the Live Stack health page leaks
  // service topology and localhost URLs; hide it from non-admins (P0-9).
  stack_health: "platform_admin",

  // Tournaments — structure edits are configurer/creator (server: requireTournamentOwner).
  tournament_create: "configurer",
  tournament_blinds: "configurer",
  blind_level_add: "configurer",
  tournament_prizes: "configurer",
  prize_pool_add: "configurer",
  balancing_rule_set: "configurer",
  tournament_start: "configurer",
  tournament_finalize: "configurer",
  tournament_config: "configurer",

  // Cash games — club-bound table creation is configurer; plain tables anyone.
  // (table_create allows non-club tables for any user, so leave it registered.)
};

/** Does `roles` satisfy `level` in the given active club? Platform admins pass
 *  everything. Fail-closed while roles are still loading. */
export function meetsAccess(
  level: AccessLevel,
  roles: MeRoles,
  activeClubId: string | null,
): boolean {
  if (roles.platform_admin) return true;
  switch (level) {
    case "public":
      return true;
    case "registered":
      return true; // reaching the Command Center implies a session
    case "member": {
      return roleInClub(roles, activeClubId) !== null;
    }
    case "configurer": {
      const r = roleInClub(roles, activeClubId);
      return !!r && r.can_configure;
    }
    case "owner": {
      const r = roleInClub(roles, activeClubId);
      return !!r && r.operator && r.role === "owner";
    }
    case "platform_admin":
      return roles.platform_admin;
    default:
      return true;
  }
}

/** Whether a command should be shown, given its id and the active club. Commands
 *  with no explicit access level default to "registered". */
export function canRunInClub(
  commandId: string,
  roles: MeRoles,
  activeClubId: string | null,
): boolean {
  const level = COMMAND_ACCESS[commandId] ?? "registered";
  // While roles are still loading, hide role-gated commands (least-visible).
  if (!roles.loaded && level !== "public" && level !== "registered") return false;
  return meetsAccess(level, roles, activeClubId);
}

/** A human label for the caller's standing in the active club (for the badge). */
export function clubStandingLabel(roles: MeRoles, activeClubId: string | null): string {
  if (roles.platform_admin) return "Platform Admin";
  const r = roleInClub(roles, activeClubId);
  if (!r) return "Not a member";
  const base = r.role.charAt(0).toUpperCase() + r.role.slice(1);
  if (r.operator && r.can_configure && r.role !== "owner") return `${base} · can configure`;
  return base;
}

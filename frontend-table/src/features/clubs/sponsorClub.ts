// Resolving the club that sponsors a table.
//
// Every table on the platform belongs to a club: buy-ins draw the player's
// club-allocated balance and pots rake to the club, so a table with no club has
// no ledger to settle into. `table_create` enforces this server-side and rejects
// a request without a club_id.
//
// Not one of the four call sites was sending one. This is the shared lookup so
// they cannot drift apart again.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

export interface SponsorClub {
  id: string;
  name: string;
}

/** Raised when the caller operates no club, so they cannot host at all. */
export class NoSponsorClubError extends Error {
  constructor() {
    super(
      "Hosting a table needs a club to sponsor it. Create a club, or ask an operator to add you to theirs.",
    );
    this.name = "NoSponsorClubError";
  }
}

/**
 * The clubs the caller may host under — those they own or can configure.
 * `me_roles` is the authority; the server re-checks on every table_create, so
 * this only decides what the UI offers.
 */
export async function listSponsorClubs(): Promise<SponsorClub[]> {
  try {
    const roles = (await callSessionRpc("me_roles", {})) as {
      club_admin_of?: string[];
      clubs?: Array<{ club_id: string; role: string; can_configure?: boolean }>;
    };
    const ids = new Set(roles?.club_admin_of ?? []);
    for (const c of roles?.clubs ?? []) {
      if (c.can_configure || c.role === "owner") ids.add(c.club_id);
    }
    if (ids.size === 0) return [];

    // Names come from club_list; fall back to the id so a club is still
    // selectable if the lookup is unavailable.
    let names = new Map<string, string>();
    try {
      const list = (await callSessionRpc("club_list", {})) as {
        clubs?: Array<{ id: string; name: string }>;
      };
      names = new Map((list?.clubs ?? []).map((c) => [c.id, c.name]));
    } catch {
      /* names are cosmetic here */
    }
    return [...ids].map((id) => ({ id, name: names.get(id) ?? id }));
  } catch {
    return [];
  }
}

/**
 * The club id to host under. Prefers an explicit choice; otherwise the caller's
 * only/first sponsorable club.
 *
 * Throws NoSponsorClubError rather than returning "" — an empty club_id is
 * exactly what the server rejects, and failing here produces a message that
 * explains what to do instead of a raw RPC error.
 */
export async function resolveSponsorClubId(preferred?: string | null): Promise<string> {
  if (preferred) return preferred;
  const clubs = await listSponsorClubs();
  if (clubs.length === 0) throw new NoSponsorClubError();
  return clubs[0].id;
}

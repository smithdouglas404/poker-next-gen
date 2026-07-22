"use client";

import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import type { CommandDefinition } from "./types";

// The caller's roles, used purely to decide what the Command Center reveals.
// Every action is still enforced server-side (requireClubConfigurer / isAdmin),
// so hiding here is UX, not a security boundary.
/** The caller's fine standing in one club (mirrors backend store.ClubRole). */
export interface ClubRole {
  club_id: string;
  role: string; // owner | manager | agent (operator) OR admin | member
  can_configure: boolean;
  operator: boolean; // true = owner-seat (poker_owner)
}

export interface MeRoles {
  platform_admin: boolean;
  club_admin_of: string[];
  clubs: ClubRole[];
  loaded: boolean;
}

const EMPTY: MeRoles = { platform_admin: false, club_admin_of: [], clubs: [], loaded: false };

export function useMeRoles(): MeRoles {
  const [roles, setRoles] = useState<MeRoles>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("me_roles", {})) as Partial<MeRoles>;
        if (!cancelled) {
          setRoles({
            platform_admin: !!data.platform_admin,
            club_admin_of: Array.isArray(data.club_admin_of) ? data.club_admin_of : [],
            clubs: Array.isArray(data.clubs) ? (data.clubs as ClubRole[]) : [],
            loaded: true,
          });
        }
      } catch {
        // default: no privileges — least-visible is the safe fallback
        if (!cancelled) setRoles({ ...EMPTY, loaded: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return roles;
}

/** The caller's fine role in a specific club, or null if they don't belong. */
export function roleInClub(roles: MeRoles, clubId: string | null): ClubRole | null {
  if (!clubId) return null;
  return roles.clubs.find((c) => c.club_id === clubId) ?? null;
}

/** Whether a command (by its `requires`) should be shown to a user with `roles`. */
export function canSeeCommand(command: Pick<CommandDefinition, "requires">, roles: MeRoles): boolean {
  switch (command.requires) {
    case undefined:
      return true;
    case "platform_admin":
      return roles.platform_admin;
    case "club_admin":
      return roles.club_admin_of.length > 0 || roles.platform_admin;
    default:
      return true;
  }
}

// Verification / capability state driving the guest → registered → paying → money
// model. `enforced` is false until a KYC provider is live; while false the UI does
// not gate by capability (everything stays visible).
export interface MeVerification {
  enforced: boolean;
  verifications: Record<string, string>;
  capabilities: Record<string, boolean>;
}

const EMPTY_VERIFICATION: MeVerification = { enforced: false, verifications: {}, capabilities: {} };

export function useMeVerification(): MeVerification {
  const [v, setV] = useState<MeVerification>(EMPTY_VERIFICATION);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("me_verification", {})) as Partial<MeVerification>;
        if (!cancelled) {
          setV({
            enforced: !!data.enforced,
            verifications: data.verifications ?? {},
            capabilities: data.capabilities ?? {},
          });
        }
      } catch {
        /* dormant / not signed in — leave unenforced */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return v;
}

/** Whether a command's verification `capability` is met. No-ops (returns true)
 *  while verification is not enforced. Default (no capability) requires email. */
export function canAccessCommand(
  command: Pick<CommandDefinition, "capability">,
  v: MeVerification,
): boolean {
  if (!v.enforced) return true;
  const cap = command.capability ?? "email";
  switch (cap) {
    case "guest":
      return true;
    case "email":
      return v.verifications.email === "verified";
    case "biometric":
      return v.verifications.biometric === "verified";
    case "kyc_aml":
      return v.verifications.kyc_aml === "verified";
    default:
      return true;
  }
}

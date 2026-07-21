"use client";

import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import type { CommandDefinition } from "./types";

// The caller's roles, used purely to decide what the Command Center reveals.
// Every action is still enforced server-side (requireClubConfigurer / isAdmin),
// so hiding here is UX, not a security boundary.
export interface MeRoles {
  platform_admin: boolean;
  club_admin_of: string[];
}

const EMPTY: MeRoles = { platform_admin: false, club_admin_of: [] };

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
          });
        }
      } catch {
        /* default: no privileges — least-visible is the safe fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return roles;
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

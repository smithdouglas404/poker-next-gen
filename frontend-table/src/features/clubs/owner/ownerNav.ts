// Shared nav config for the club-owner console surfaces (used by OwnerHub's
// section nav and the owner sub-pages' route nav). Lifted out of the old
// OwnerShell/OwnerPageShell so both can drive the single ConsoleShell.

import type { ConsoleBrand, ConsoleNavRouteItem, ConsoleNavStateItem } from "@/features/nav/ConsoleShell";
import type { OwnerSection } from "./types";

/** OwnerHub's in-page section nav (state-driven). */
export const OWNER_SECTION_NAV: (ConsoleNavStateItem & { id: OwnerSection })[] = [
  { id: "overview", label: "Club Overview", icon: "▦" },
  { id: "tables", label: "Live Tables", icon: "▤" },
  { id: "tournaments", label: "Tournament Center", icon: "♛" },
  { id: "members", label: "Member Registry", icon: "☰" },
  { id: "announcements", label: "Announcements", icon: "📣" },
  { id: "analytics", label: "Member Analytics", icon: "📊" },
  { id: "financials", label: "Revenue Reports", icon: "▧" },
  { id: "settings", label: "Global Settings", icon: "⚙" },
];

/** The standalone owner sub-pages' route nav. */
export const OWNER_PAGE_NAV: ConsoleNavRouteItem[] = [
  { href: "/clubs", label: "Owner Hub" },
  { href: "/clubs/revenue", label: "Revenue Reports" },
  { href: "/clubs/sponsorship", label: "Sponsorship Payouts" },
  { href: "/clubs/invite", label: "Invitations" },
];

/** Brand block for the owner console, derived from the club name. */
export function ownerBrand(clubName: string, subtitle: string): ConsoleBrand {
  return {
    badge: (clubName.slice(0, 2) || "CL").toUpperCase(),
    wordmark: clubName.toUpperCase(),
    subtitle,
    variant: "red",
  };
}

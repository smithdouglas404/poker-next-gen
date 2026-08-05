// Shared nav config for the club-owner console surfaces (used by OwnerHub's
// section nav and the owner sub-pages' route nav). Lifted out of the old
// OwnerShell/OwnerPageShell so both can drive the single ConsoleShell.

import { createElement } from "react";

import type { ConsoleBrand, ConsoleNavRouteItem, ConsoleNavStateItem } from "@/features/nav/ConsoleShell";
import {
  IconAnalytics,
  IconAnnounce,
  IconMembers,
  IconOperators,
  IconOverview,
  IconRevenue,
  IconSettings,
  IconTables,
  IconTrophy,
} from "@/features/ui/icons";
import type { OwnerSection } from "./types";

/**
 * OwnerHub's in-page section nav (state-driven).
 *
 * These were text glyphs: `▦ ▤ ♛ ☰ ♦ 📣 📊 ▧ ⚙` — box-drawing characters and a
 * chess piece beside two full-colour emoji, on the nav of every owner page. The
 * emoji rendered in the vendor's palette, so they were the only saturated
 * non-brand colour on screen. One monochrome stroke set now, tinted by the nav.
 */
export const OWNER_SECTION_NAV: (ConsoleNavStateItem & { id: OwnerSection })[] = [
  { id: "overview", label: "Club Overview", icon: createElement(IconOverview) },
  { id: "tables", label: "Live Tables", icon: createElement(IconTables) },
  { id: "tournaments", label: "Tournament Center", icon: createElement(IconTrophy) },
  { id: "members", label: "Member Registry", icon: createElement(IconMembers) },
  { id: "operators", label: "Operators & Equity", icon: createElement(IconOperators) },
  { id: "announcements", label: "Announcements", icon: createElement(IconAnnounce) },
  { id: "analytics", label: "Member Analytics", icon: createElement(IconAnalytics) },
  { id: "financials", label: "Revenue Reports", icon: createElement(IconRevenue) },
  { id: "settings", label: "Global Settings", icon: createElement(IconSettings) },
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
    variant: "gold",
  };
}

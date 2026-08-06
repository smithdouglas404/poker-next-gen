"use client";

// Thin preset over the shared ConsoleShell for the platform admin console:
// grouped section nav, the gold "♦ Admin / Command" brand, a glass-card sidebar,
// and a live "online" footer with a back-to-Hub link.

import Link from "next/link";
import type { ReactNode } from "react";

import { ConsoleShell, type ConsoleNavStateItem } from "@/features/nav/ConsoleShell";
import {
  IconAlert,
  IconAnnounce,
  IconAudit,
  IconLedger,
  IconMail,
  IconMembers,
  IconOperators,
  IconOverview,
  IconRevenue,
  IconSettings,
  IconTables,
  IconTrophy,
  IconWallet,
} from "@/features/ui/icons";

import type { AdminSection } from "./types";

// One monochrome stroke family, tinted by the nav (gold when active). This was
// `◎ ◈ ✦ ▤ ⚠ ❖ ✉ ◆ ♠ ★ ⚙ ⚖ ▦` — thirteen glyphs from four Unicode blocks at
// four apparent weights, some of which the font renders in its own colour.
const NAV: (ConsoleNavStateItem & { id: AdminSection })[] = [
  { id: "overview", label: "Overview", icon: <IconOverview />, group: "Console" },
  { id: "users", label: "Users", icon: <IconMembers />, group: "Console" },
  { id: "kyc", label: "KYC Queue", icon: <IconOperators />, group: "Compliance" },
  { id: "withdrawals", label: "Withdrawals", icon: <IconWallet />, group: "Compliance" },
  { id: "anticheat", label: "Anti-Cheat", icon: <IconAlert />, group: "Compliance" },
  { id: "announcements", label: "Announcements", icon: <IconAnnounce />, group: "Operations" },
  { id: "support", label: "Support", icon: <IconMail />, group: "Operations" },
  { id: "finance", label: "Settlements", icon: <IconRevenue />, group: "Operations" },
  { id: "cashgames", label: "Cash Games", icon: <IconTables />, group: "Operations" },
  { id: "rewards", label: "Rewards", icon: <IconTrophy />, group: "Operations" },
  { id: "platform", label: "Platform", icon: <IconSettings />, group: "System" },
  { id: "ledger", label: "Ledger", icon: <IconLedger />, group: "System" },
  { id: "audit", label: "Audit Log", icon: <IconAudit />, group: "System" },
];

export function AdminShell({
  section,
  onSection,
  online,
  children,
}: {
  section: AdminSection;
  onSection: (s: AdminSection) => void;
  online: number | null;
  children: ReactNode;
}) {
  const footer = (
    <div className="flex items-center justify-between text-[11px] text-neutral-500">
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        {online !== null ? `${online} online` : "—"}
      </span>
      <Link href="/hub" className="text-gold-lite/80 transition hover:text-gold-lite">
        ← Hub
      </Link>
    </div>
  );

  return (
    <ConsoleShell
      brand={{ badge: "♦", wordmark: "Admin", subtitle: "Command", variant: "gold" }}
      nav={{ mode: "state", active: section, onSelect: (id) => onSection(id as AdminSection), items: NAV }}
      accent="brand"
      sidebarVariant="card"
      footer={footer}
    >
      <div className="space-y-6">{children}</div>
    </ConsoleShell>
  );
}

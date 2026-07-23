"use client";

// Thin preset over the shared ConsoleShell for the platform admin console:
// grouped section nav, the gold "♦ Admin / Command" brand, a glass-card sidebar,
// and a live "online" footer with a back-to-Hub link.

import Link from "next/link";
import type { ReactNode } from "react";

import { ConsoleShell, type ConsoleNavStateItem } from "@/features/nav/ConsoleShell";

import type { AdminSection } from "./types";

const NAV: (ConsoleNavStateItem & { id: AdminSection })[] = [
  { id: "overview", label: "Overview", icon: "◎", group: "Console" },
  { id: "users", label: "Users", icon: "◈", group: "Console" },
  { id: "kyc", label: "KYC Queue", icon: "✦", group: "Compliance" },
  { id: "withdrawals", label: "Withdrawals", icon: "▤", group: "Compliance" },
  { id: "anticheat", label: "Anti-Cheat", icon: "⚠", group: "Compliance" },
  { id: "announcements", label: "Announcements", icon: "❖", group: "Operations" },
  { id: "support", label: "Support", icon: "✉", group: "Operations" },
  { id: "finance", label: "Settlements", icon: "◆", group: "Operations" },
  { id: "platform", label: "Platform", icon: "⚙", group: "System" },
  { id: "audit", label: "Audit Log", icon: "▦", group: "System" },
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
      <Link href="/hub" className="text-brand/80 transition hover:text-brand">
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

"use client";

// Thin preset over the shared ConsoleShell for the standalone club-owner
// sub-pages (route-driven nav, gold accent, title header). All the chrome lives
// in ConsoleShell now — this file is just the owner-sub-page configuration.
// Toast/useToast were lifted to features/ui/Toast; re-exported here for the
// pages that still import them from this module.

import type { ReactNode } from "react";

import { ConsoleShell } from "@/features/nav/ConsoleShell";

import { OWNER_PAGE_NAV, ownerBrand } from "./ownerNav";
import { DemoBadge } from "./ui";

export { Toast, useToast } from "@/features/ui/Toast";

export function OwnerPageShell({
  clubName,
  title,
  subtitle,
  demo,
  children,
}: {
  clubName: string;
  title: string;
  subtitle?: string;
  demo: boolean;
  children: ReactNode;
}) {
  return (
    <ConsoleShell
      brand={ownerBrand(clubName, "CLUB OWNER TOOLS")}
      nav={{ mode: "route", items: OWNER_PAGE_NAV }}
      accent="gold"
      collapsible
      header={
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-white md:text-4xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
          </div>
          {demo && <DemoBadge />}
        </header>
      }
    >
      {children}
    </ConsoleShell>
  );
}

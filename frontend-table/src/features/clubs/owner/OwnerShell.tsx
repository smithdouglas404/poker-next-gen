"use client";

// Thin preset over the shared ConsoleShell for the club-owner hub. The
// owner-specific chrome is the sticky top bar (bankroll / online / owner menu)
// and the "Browse other clubs" back-link; the sidebar + main skeleton comes from
// ConsoleShell. Brand lives in the top bar, so no sidebar brand block is passed.

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ConsoleShell } from "@/features/nav/ConsoleShell";

import { usd } from "./ownerRpc";
import { OWNER_SECTION_NAV } from "./ownerNav";
import { DemoBadge } from "./ui";
import type { OwnerSection } from "./types";

export function OwnerShell({
  section,
  onSection,
  clubName,
  bankrollCents,
  onlineCount,
  memberCount,
  role,
  demo,
  onBrowse,
  children,
}: {
  section: OwnerSection;
  onSection: (s: OwnerSection) => void;
  clubName: string;
  bankrollCents: number;
  onlineCount: number;
  memberCount: number;
  role: string | null;
  demo: boolean;
  onBrowse?: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const topBar = (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#262d38]">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-base font-bold text-white"
            style={{ background: "linear-gradient(180deg,#ff2d3f,#b3151f)", boxShadow: "0 4px 14px -4px rgba(224,30,43,0.4)" }}
          >
            {(clubName.slice(0, 2) || "CL").toUpperCase()}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="font-display text-sm font-bold tracking-wide text-foreground">{clubName.toUpperCase()}</div>
            <div className="text-[10px] tracking-[0.35em] text-white/40">CLUB OWNER</div>
          </div>
        </div>

        <div className="ml-2 hidden items-center gap-6 md:flex">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Total Club Bankroll</span>
            <p className="font-display text-lg font-bold leading-tight text-gold">{usd(bankrollCents)}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Online Members</span>
            <p className="font-display text-lg font-bold leading-tight text-green">
              {onlineCount}
              <span className="text-white/40">/{memberCount || "—"}</span>
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {demo && <DemoBadge />}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm transition hover:border-white/20"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[#231b00]"
                style={{ background: "linear-gradient(180deg,#ffd54a,#f5c518)" }}
              >
                {(role ?? "O").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden capitalize sm:inline">{role ?? "Owner"}</span>
              <span className="text-white/40">▾</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-white/[0.06] bg-[#262d38] py-1 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                <Link href="/hub" className="block px-4 py-2 text-white/75 hover:bg-white/5">
                  Command Center
                </Link>
                <Link href="/table" className="block px-4 py-2 text-white/75 hover:bg-white/5">
                  Go to Table
                </Link>
                <Link href="/account" className="block px-4 py-2 text-white/75 hover:bg-white/5">
                  Account
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  const backLink = onBrowse ? (
    <button
      type="button"
      onClick={onBrowse}
      className="hidden text-left text-xs text-muted transition hover:text-brand md:inline-block"
    >
      Browse other clubs →
    </button>
  ) : undefined;

  return (
    <ConsoleShell
      nav={{ mode: "state", active: section, onSelect: (id) => onSection(id as OwnerSection), items: OWNER_SECTION_NAV }}
      accent="redGradient"
      showActiveBadge
      topBar={topBar}
      backLink={backLink}
    >
      {children}
    </ConsoleShell>
  );
}

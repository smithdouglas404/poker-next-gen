"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/features/ui/tokens";

import type { Club, ClubSection } from "./types";

const NAV: Array<{ id: ClubSection; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "members", label: "Members", icon: "☰" },
  { id: "games", label: "Games & Tournaments", icon: "♠" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "alliances", label: "League & Alliances", icon: "⚑" },
  { id: "analytics", label: "Analytics", icon: "📊" },
];

export function ClubShell({
  section,
  onSection,
  clubs,
  activeClubId,
  onSelectClub,
  clubName,
  memberCount,
  role,
  children,
}: {
  section: ClubSection;
  onSection: (s: ClubSection) => void;
  clubs: Club[];
  activeClubId: string | null;
  onSelectClub: (id: string) => void;
  clubName: string;
  memberCount: number | null;
  role: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-3 py-4 md:px-6 md:py-6">
        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c2128] md:flex-row"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
        >
          {/* Sidebar */}
          <aside className="shrink-0 border-b border-white/[0.06] p-5 md:w-[248px] md:border-b-0 md:border-r md:p-6">
            <div className="mb-6 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-lg font-bold text-white"
                style={{ background: "linear-gradient(180deg,#ff2d3f,#b3151f)", boxShadow: "0 4px 14px -4px rgba(224,30,43,0.4)" }}
              >
                HR
              </div>
              <div className="leading-tight">
                <div className="font-display text-sm font-bold tracking-wide text-foreground">HIGH ROLLERS</div>
                <div className="text-[11px] tracking-[0.35em] text-white/40">CLUB</div>
              </div>
            </div>

            {/* Club switcher */}
            <label className="mb-5 block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
                Your Clubs
              </span>
              <select
                value={activeClubId ?? ""}
                onChange={(e) => onSelectClub(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan/40"
              >
                {clubs.length === 0 && <option value="">No clubs</option>}
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <nav className="space-y-1">
              {NAV.map((n) => {
                const active = n.id === section;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onSection(n.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "border border-transparent bg-gradient-to-r from-[#e01e2b] to-[#b3151f] text-white shadow-[0_6px_18px_-8px_rgba(224,30,43,0.5)]"
                        : "border border-transparent text-white/55 hover:bg-white/[0.04] hover:text-white/80",
                    )}
                  >
                    <span className="w-5 text-center opacity-80">{n.icon}</span>
                    <span className="font-medium">{n.label}</span>
                  </button>
                );
              })}
            </nav>

            <Link
              href="/hub"
              className="mt-8 inline-flex items-center gap-1 text-xs text-muted transition hover:text-brand"
            >
              ← Command Center
            </Link>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col p-5 md:p-7">
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
                  {NAV.find((n) => n.id === section)?.label}
                </p>
                <h1 className="font-display mt-1 text-3xl font-bold uppercase tracking-wide text-white">
                  {clubName}
                </h1>
              </div>
              <div className="text-right text-[11px] uppercase tracking-[0.22em] text-white/40">
                {role && <span className="text-gold">{role} · </span>}
                {memberCount !== null ? `${memberCount} member${memberCount === 1 ? "" : "s"}` : "—"}
              </div>
            </header>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

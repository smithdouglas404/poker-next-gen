"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import type { AdminSection } from "./types";

const NAV: { id: AdminSection; label: string; glyph: string; group: string }[] = [
  { id: "overview", label: "Overview", glyph: "◎", group: "Console" },
  { id: "users", label: "Users", glyph: "◈", group: "Console" },
  { id: "kyc", label: "KYC Queue", glyph: "✦", group: "Compliance" },
  { id: "withdrawals", label: "Withdrawals", glyph: "▤", group: "Compliance" },
  { id: "anticheat", label: "Anti-Cheat", glyph: "⚠", group: "Compliance" },
  { id: "announcements", label: "Announcements", glyph: "❖", group: "Operations" },
  { id: "support", label: "Support", glyph: "✉", group: "Operations" },
  { id: "finance", label: "Settlements", glyph: "◆", group: "Operations" },
  { id: "platform", label: "Platform", glyph: "⚙", group: "System" },
  { id: "audit", label: "Audit Log", glyph: "▦", group: "System" },
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
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        {/* Sidebar */}
        <aside className="lg:w-64 lg:shrink-0">
          <div className={cn(GLASS_PANEL, "sticky top-6 p-4")}>
            <div className="flex items-center gap-3 px-2 pb-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#d4a80f] via-[#f5c518] to-[#ffd54a] text-lg font-black text-black shadow-[0_0_20px_rgba(245,197,24,0.25)]">
                ♦
              </div>
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                  Admin
                </p>
                <p className="text-[10px] uppercase tracking-[0.24em] text-gold/70">Command</p>
              </div>
            </div>

            <nav className="space-y-4">
              {groups.map((g) => (
                <div key={g}>
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
                    {g}
                  </p>
                  <div className="space-y-0.5">
                    {NAV.filter((n) => n.group === g).map((n) => {
                      const active = n.id === section;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onSection(n.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                            active
                              ? "border border-brand/40 bg-brand/[0.1] text-brand"
                              : "border border-transparent text-neutral-400 hover:bg-white/[0.03] hover:text-white",
                          )}
                        >
                          <span className={cn("text-base", active ? "text-brand" : "text-neutral-500")}>
                            {n.glyph}
                          </span>
                          <span className="font-medium">{n.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-4 border-t border-white/[0.06] px-2 pt-4">
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
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}

"use client";

// Shared chrome for the standalone club-owner sub-pages. Left sidebar of owner
// tools (mirrors the HRC "Club Owner Tools" nav) + a title header, rendered in
// the GGPoker theme (near-black base, #262d38 cards, red brand, gold accents).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { cn } from "@/features/ui/tokens";

import { DemoBadge } from "./ui";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/clubs", label: "Owner Hub" },
  { href: "/clubs/revenue", label: "Revenue Reports" },
  { href: "/clubs/sponsorship", label: "Sponsorship Payouts" },
  { href: "/clubs/invite", label: "Member Invites" },
  { href: "/clubs/invite/system", label: "Invitation System" },
];

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="shrink-0 border-b border-white/[0.06] px-4 py-5 md:w-[248px] md:border-b-0 md:border-r md:py-8">
          <div className="mb-6 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-base font-bold text-white"
              style={{
                background: "linear-gradient(180deg,#ff2d3f,#b3151f)",
                boxShadow: "0 4px 14px -4px rgba(224,30,43,0.4)",
              }}
            >
              {(clubName.slice(0, 2) || "CL").toUpperCase()}
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-wide text-foreground">
                {clubName.toUpperCase()}
              </div>
              <div className="text-[10px] tracking-[0.3em] text-white/40">CLUB OWNER TOOLS</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mb-2 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 md:hidden"
          >
            Menu <span className="text-white/40">{open ? "▴" : "▾"}</span>
          </button>

          <nav className={cn("flex-col gap-1", open ? "flex" : "hidden md:flex")}>
            {NAV.map((n) => {
              const active =
                pathname === n.href ||
                (n.href !== "/clubs" && pathname.startsWith(n.href)) ||
                (n.href === "/clubs" && pathname === "/clubs");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm transition",
                    active
                      ? "border border-gold/40 bg-gold/[0.08] font-semibold text-gold"
                      : "border border-transparent text-white/55 hover:bg-white/[0.04] hover:text-white/85",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-white md:text-4xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
            </div>
            {demo && <DemoBadge />}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Toast helper shared by the sub-pages. */
export function Toast({ toast }: { toast: { msg: string; kind: "ok" | "err" } | null }) {
  if (!toast) return null;
  return (
    <div
      className={cn(
        "fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg",
        toast.kind === "ok"
          ? "border-[#22c55e]/30 bg-[#0a7d43]/25 text-[#bff5d3]"
          : "border-[#e01e2b]/35 bg-[#b3151f]/25 text-[#ffcdd1]",
      )}
    >
      {toast.msg}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const notify = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };
  return { toast, notify };
}

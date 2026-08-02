"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/nextjs";
import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

// ── Navigation items ─────────────────────────────────────────
const NAV: Array<{ label: string; href: string; icon: string }> = [
  { label: "Play",        href: "/lobby",        icon: "♠" },
  { label: "Cash Games",  href: "/cash-games",   icon: "◈" },
  { label: "Tournaments", href: "/tournaments",  icon: "🏆" },
  { label: "Clubs",       href: "/clubs",        icon: "♣" },
  { label: "Market",      href: "/marketplace",  icon: "✦" },
  { label: "Trainer",     href: "/trainer/range",icon: "◉" },
  { label: "Social",      href: "/social",       icon: "♦" },
  { label: "Wallet",      href: "/cashier",      icon: "$" },
  { label: "Dashboard",   href: "/hub",          icon: "⌘" },
];

const HIDE_ON = ["/", "/hub", "/login", "/table", "/proof", "/sign-in", "/sign-up"];

export function SiteNav() {
  const pathname = usePathname() || "/";
  const router   = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [code, setCode]         = useState("");

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const joinByCode = () => {
    const c = code.trim().toUpperCase();
    if (c) router.push(`/lobby?code=${encodeURIComponent(c)}`);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0d12]/90 backdrop-blur-2xl">
      {/* Gold accent line at very top */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f5c518]/40 to-transparent" />

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3">
        {/* ── Brand ─────────────────────────────────────────── */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5 group">
          <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ffe066] via-[#f5c518] to-[#c9a000] shadow-[0_0_16px_rgba(245,197,24,0.35)] transition-shadow group-hover:shadow-[0_0_24px_rgba(245,197,24,0.55)]">
            <span className="font-display text-sm font-black text-[#1a1200] tracking-tight">HR</span>
          </div>
          <div className="hidden sm:block">
            <span className="block font-display text-sm font-bold uppercase tracking-[0.12em] text-white leading-none">
              High Rollers
            </span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.35em] text-[#f5c518]/70 leading-none mt-0.5">
              Club
            </span>
          </div>
        </Link>

        {/* ── Primary nav (desktop) ─────────────────────────── */}
        <nav className="hidden flex-1 items-center gap-0.5 lg:flex ml-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150",
                isActive(n.href)
                  ? "bg-[#f5c518]/[0.10] text-[#f5c518] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-neutral-400 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              {isActive(n.href) && (
                <span className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-[#f5c518]/60 to-transparent" />
              )}
              {n.label}
            </Link>
          ))}
        </nav>

        {/* ── Right side: code input + auth ────────────────── */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {/* Table code join */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.09] bg-white/[0.03] py-1.5 pl-3 pr-1.5 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">♠</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
              maxLength={8}
              placeholder="TABLE CODE"
              aria-label="Join a table with an access code"
              className="w-24 bg-transparent font-mono text-xs uppercase tracking-[0.18em] text-white outline-none placeholder:text-neutral-700"
            />
            <button
              type="button"
              onClick={joinByCode}
              disabled={!code.trim()}
              className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-white/[0.14] disabled:opacity-40"
            >
              Join
            </button>
          </div>

          {/* Auth */}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className={cn(BTN_GOLD, "rounded-xl px-4 py-2 text-xs uppercase tracking-wide cursor-pointer")}>
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-xl border border-white/20 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/30 hover:bg-white/[0.08] cursor-pointer">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>

        {/* ── Mobile hamburger ──────────────────────────────── */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.10] text-neutral-300 transition hover:bg-white/[0.06] lg:hidden"
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      {menuOpen && (
        <div className="border-t border-white/[0.06] bg-[#0a0d12]/95 px-5 py-4 lg:hidden animate-fade-in">
          <div className="grid grid-cols-2 gap-1.5">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  isActive(n.href)
                    ? "bg-[#f5c518]/[0.10] text-[#f5c518]"
                    : "text-neutral-300 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] py-1.5 pl-3 pr-1.5">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
              maxLength={8}
              placeholder="TABLE CODE"
              className="flex-1 bg-transparent font-mono text-xs uppercase tracking-widest text-white outline-none placeholder:text-neutral-700"
            />
            <button
              type="button"
              onClick={joinByCode}
              className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-bold uppercase text-white"
            >
              Join
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className={cn(BTN_GOLD, "flex-1 rounded-xl py-2.5 text-xs uppercase tracking-wide cursor-pointer")}>
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="flex-1 rounded-xl border border-white/20 py-2.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/[0.06] transition cursor-pointer">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <div className="flex-1"><UserButton /></div>
            </Show>
          </div>
        </div>
      )}
    </header>
  );
}

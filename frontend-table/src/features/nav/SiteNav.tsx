"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/nextjs";

import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

// The primary sections a member navigates between. These are the real routes
// that were previously unreachable — no page linked to most of them.
const NAV: Array<{ label: string; href: string }> = [
  { label: "Play", href: "/lobby" },
  { label: "Clubs", href: "/clubs" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Studio", href: "/studio" },
  { label: "Market", href: "/marketplace" },
  { label: "Wallet", href: "/wallet" },
  { label: "Dashboard", href: "/hub" },
];

// Routes that own their own chrome or the full viewport — the marketing page,
// the member home (CommandCenter has its own nav), the auth page, and the live
// table/proof. The global nav only fills the gap on deep section pages that
// otherwise have no top-level navigation (studio, marketplace, wallet, …).
const HIDE_ON = ["/", "/hub", "/login", "/table", "/proof", "/sign-in", "/sign-up"];

export function SiteNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [code, setCode] = useState("");

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const joinByCode = () => {
    const c = code.trim().toUpperCase();
    if (c) router.push(`/lobby?code=${encodeURIComponent(c)}`);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0b0d0f]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3">
        {/* brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#f5c518] to-[#d4a80f] font-display text-sm font-bold text-black">
            HR
          </span>
          <span className="hidden font-display text-sm font-bold uppercase tracking-wider text-foreground sm:inline">
            High Rollers Club
          </span>
        </Link>

        {/* primary links (desktop) */}
        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                isActive(n.href)
                  ? "bg-white/[0.07] text-white"
                  : "text-neutral-400 hover:text-white",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* access-code join & auth (desktop) */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <div className={cn(GLASS_PANEL, "flex items-center gap-1 py-1 pl-3 pr-1")}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
              maxLength={8}
              placeholder="TABLE CODE"
              aria-label="Join a table with an access code"
              className="w-28 bg-transparent font-mono text-xs uppercase tracking-[0.2em] text-white outline-none placeholder:text-neutral-600"
            />
            <button
              type="button"
              onClick={joinByCode}
              disabled={!code.trim()}
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              Join
            </button>
          </div>
          
          {/* Clerk Auth Controls */}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className={cn(BTN_GOLD, "rounded-lg px-4 py-2 text-xs uppercase tracking-wide cursor-pointer")}>
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg border border-white/30 px-4 py-2 text-xs uppercase tracking-wide text-white hover:bg-white/10 transition cursor-pointer">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-300 lg:hidden"
          aria-label="Toggle menu"
        >
          ☰
        </button>
      </div>

      {/* mobile drawer */}
      {menuOpen && (
        <div className="border-t border-white/[0.07] px-5 py-4 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  isActive(n.href) ? "bg-white/[0.07] text-white" : "text-neutral-300 hover:text-white",
                )}
              >
                {n.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
              maxLength={8}
              placeholder="TABLE CODE"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs uppercase tracking-widest text-white outline-none placeholder:text-neutral-600"
            />
            <button
              type="button"
              onClick={joinByCode}
              className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold uppercase text-white"
            >
              Join
            </button>
          </div>
          
          {/* Mobile Clerk Auth Controls */}
          <div className="mt-3 flex gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className={cn(BTN_GOLD, "flex-1 rounded-lg py-2.5 text-xs uppercase tracking-wide cursor-pointer")}>
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="flex-1 rounded-lg border border-white/30 py-2.5 text-xs uppercase tracking-wide text-white hover:bg-white/10 transition cursor-pointer">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <div className="flex-1">
                <UserButton />
              </div>
            </Show>
          </div>
        </div>
      )}
    </header>
  );
}


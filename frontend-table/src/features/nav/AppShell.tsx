"use client";

// The persistent application shell: a left sidebar of every destination plus a
// top bar carrying the player's live balance and quick actions.
//
// WHY THIS EXISTS: before this, every screen rendered its own bespoke header and
// a one-off "← Command Center" text link, so the app read as a set of unrelated
// pages rather than one product. HRC's shell (client/src/components/
// DashboardLayout.tsx) is the reference for the structure — a fixed 220px rail
// with a primary section, a collapsible "More" section, a global search, and a
// balance footer. This is that structure rebuilt on our GGPoker tokens: slate
// chrome, GG red for the active state, gold reserved for money.
//
// Mounted once in app/layout.tsx, so all 60+ screens inherit it. Immersive and
// pre-auth surfaces opt out via HIDE_ON.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { registerDevice } from "@/features/security/deviceRegister";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  BarChart3,
  ChevronRight,
  Coins,
  Crown,
  FileSearch,
  Gift,
  Handshake,
  LayoutDashboard,
  Link as LinkIcon,
  Medal,
  Menu,
  MoreHorizontal,
  Search,
  Shield,
  ShoppingBag,
  Shirt,
  Star,
  Store,
  Swords,
  Trophy,
  Users,
  Wallet,
  X,
  LifeBuoy,} from "lucide-react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useMeRoles } from "@/features/commands/useMeRoles";
import { cn } from "@/features/ui/tokens";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { SPRINGS } from "@/features/ui/motion";

interface NavItem {
  icon: typeof Shield;
  label: string;
  href: string;
  /** Extra path prefixes that should also light this item up. */
  match?: string[];
}

// The eight destinations a player uses constantly. Always expanded.
const PRIMARY: NavItem[] = [
  // /hub deliberately NOT matched here any more: it is the ops console, not a
  // player screen, and highlighting "My Dashboard" while standing on it told
  // players it was theirs.
  { icon: LayoutDashboard, label: "My Dashboard", href: "/dashboard", match: ["/dashboard"] },
  { icon: Trophy, label: "Games & Tables", href: "/lobby", match: ["/lobby", "/table"] },
  { icon: Medal, label: "Tournaments", href: "/tournaments" },
  { icon: Users, label: "Clubs", href: "/clubs" },
  { icon: Award, label: "Leaderboard", href: "/loyalty" },
  { icon: Wallet, label: "Wallet", href: "/wallet" },
  { icon: Gift, label: "Rewards", href: "/rewards" },
  { icon: Star, label: "Membership", href: "/membership" },
];

// Everything else, behind a "More" disclosure so the rail stays scannable.
const SECONDARY: NavItem[] = [
  { icon: Store, label: "Marketplace", href: "/marketplace" },
  { icon: Shirt, label: "Avatar Studio", href: "/studio" },
  { icon: Handshake, label: "Staking", href: "/staking" },
  { icon: Swords, label: "Club Wars", href: "/clubwars" },
  { icon: Swords, label: "Leagues & Alliances", href: "/leagues" },
  { icon: Crown, label: "Alliances", href: "/alliances" },
  { icon: BarChart3, label: "GTO Trainer", href: "/trainer" },
  { icon: FileSearch, label: "Hand History", href: "/hands" },
  { icon: LinkIcon, label: "Provably Fair", href: "/provably-fair" },
  { icon: Shield, label: "Game Integrity", href: "/integrity" },
  { icon: ShoppingBag, label: "Verification", href: "/kyc" },
  { icon: Users, label: "My Profile", href: "/profile" },
  { icon: LifeBuoy, label: "Support", href: "/support" },
];

const ADMIN: NavItem = { icon: Shield, label: "Admin", href: "/admin" };

// Surfaces that own the full viewport or run before sign-in. The table and proof
// are immersive by design (CLAUDE.md: chrome stays out of the felt's way); the
// marketing and auth pages have their own chrome.
const HIDE_ON = ["/", "/login", "/table", "/proof", "/sign-in", "/sign-up", "/hrc"];

/** Cents → a compact chip label for the rail footer. */
function balanceLabel(cents: number | null): string {
  if (cents === null) return "—";
  const d = cents / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(2)}M`;
  if (d >= 10_000) return `$${(d / 1_000).toFixed(1)}k`;
  return `$${d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <motion.div
        whileHover={{ x: 2 }}
        transition={SPRINGS.snappy}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors",
          active ? "text-[#ff2d3f]" : "text-neutral-400 hover:bg-white/[0.05] hover:text-foreground",
        )}
      >
        {active && (
          // layoutId gives the active pill a single shared identity, so it
          // SLIDES between rows on navigation instead of popping.
          <motion.div
            layoutId="shell-active"
            className="absolute inset-0 rounded-lg border border-[#e01e2b]/30 bg-[#e01e2b]/10"
            style={{ boxShadow: "0 0 16px rgba(224,30,43,0.12), inset 0 0 10px rgba(224,30,43,0.06)" }}
            transition={SPRINGS.snappy}
          />
        )}
        <Icon className="relative z-10 h-4 w-4 shrink-0" />
        <span className="relative z-10 tracking-wide">{item.label}</span>
        {active && (
          <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-[#ff2d3f] shadow-[0_0_6px_rgba(255,45,63,0.6)]" />
        )}
      </motion.div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const roles = useMeRoles();

  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [balance, setBalance] = useState<number | null>(null);

  const hidden = HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Authoritative balance for the rail footer. Server truth only — if the RPC
  // fails we show "—" rather than a guess (CLAUDE.md non-negotiable #3).
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = (await callSessionRpc("wallet_get", {})) as { balance_cents?: number };
        if (!cancelled) setBalance(typeof r?.balance_cents === "number" ? r.balance_cents : null);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hidden, pathname]);

  // Register this device once per session for multi-account / shared-device
  // detection. device_register shipped with the anti-cheat backend and had no
  // caller, so every shared-device check downstream read an empty table and
  // reported a clean platform. Fire-and-forget: a player is never blocked
  // because a fraud signal could not be recorded.
  useEffect(() => {
    if (hidden) return;
    void registerDevice();
  }, [hidden]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const submitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (q) router.push(`/lobby?q=${encodeURIComponent(q)}`);
    },
    [query, router],
  );

  if (hidden) return <>{children}</>;

  const isActive = (item: NavItem) =>
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    (item.match ?? []).some((m) => pathname === m || pathname.startsWith(m + "/"));

  const secondary = roles.platform_admin ? [...SECONDARY, ADMIN] : SECONDARY;

  const rail = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] font-display text-[11px] font-bold text-black">
          HR
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[11px] font-bold leading-none tracking-[0.15em] text-[#f5c518]">
            HIGH ROLLERS
          </span>
          <span className="mt-1 block text-[9px] tracking-[0.25em] text-neutral-500">CLUB</span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setDrawerOpen(false);
          }}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </Link>

      {/* Global search */}
      <form onSubmit={submitSearch} className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables…"
            aria-label="Search tables"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-neutral-600"
          />
        </div>
      </form>

      {/* Destinations */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
        {PRIMARY.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item)} />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4 shrink-0" />
          <span className="tracking-wide">More</span>
          <ChevronRight className={cn("ml-auto h-3 w-3 transition-transform", moreOpen && "rotate-90")} />
        </button>

        <AnimatePresence initial={false}>
          {moreOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-0.5 overflow-hidden"
            >
              {secondary.map((item) => (
                <NavRow key={item.href} item={item} active={isActive(item)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Persistent balance — the rail's money footer, links to the cashier. */}
      <div className="px-3 pb-4">
        <Link href="/wallet">
          <div className="flex items-center gap-2.5 rounded-lg border border-[#f5c518]/15 bg-[#f5c518]/[0.06] px-3 py-2.5 transition-colors hover:border-[#f5c518]/35 hover:bg-[#f5c518]/10">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#f5c518]/15">
              <Coins className="h-3 w-3 text-[#f5c518]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-medium uppercase tracking-wider text-neutral-500">
                Total Balance
              </span>
              <span className="block text-xs font-bold tabular-nums text-[#f5c518]">
                {balanceLabel(balance)}
              </span>
            </span>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 border-r border-white/[0.06] bg-[#12161d]/95 backdrop-blur-xl lg:block">
        {rail}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={SPRINGS.snappy}
              className="fixed inset-y-0 left-0 z-50 w-[220px] border-r border-white/[0.06] bg-[#12161d] lg:hidden"
            >
              {rail}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — balance + quick actions on every screen. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.06] bg-[#12161d]/85 px-4 py-2.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex-1" />

          {/* Was a bell that only navigated to /dashboard — a control that looked
              like an inbox and was not one. Now reads real Nakama notifications,
              which is also where club broadcasts land. */}
          <NotificationBell />

          <Link
            href="/wallet"
            className="flex items-center gap-1.5 rounded-full border border-[#f5c518]/25 bg-[#f5c518]/10 px-3 py-1.5 text-[11px] font-bold tabular-nums text-[#f5c518] transition-colors hover:bg-[#f5c518]/20"
          >
            <Coins className="h-3 w-3" />
            {balanceLabel(balance)}
          </Link>

          <Link
            href="/rewards"
            className="hidden items-center gap-1.5 rounded-full border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-1.5 text-[11px] font-bold text-[#22c55e] transition-colors hover:bg-[#22c55e]/20 sm:flex"
          >
            <Gift className="h-3 w-3" />
            Daily bonus
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

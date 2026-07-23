"use client";

// ConsoleShell — the single console/sidebar chrome for every operator surface
// (club owner hub, owner sub-pages, and the platform admin console). It replaces
// the four near-duplicate shells (ClubShell/OwnerShell/OwnerPageShell/AdminShell)
// that all rendered the same skeleton: outer wrapper → optional sticky top bar →
// centered flex (max-w-1400, md breakpoint) → <aside> brand + nav → <main>.
//
// The two genuine structural forks are the `nav` prop (state-driven buttons vs
// route-driven links) and grouped nav (derived from items carrying a `group`).
// Everything else — top bar, main header, sidebar footer, back-link — is a
// composition slot. Active-pill accent is a prop so each surface keeps its look.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

export type ConsoleNavStateItem = { id: string; label: string; icon?: string; group?: string };
export type ConsoleNavRouteItem = { href: string; label: string; icon?: string };
export type ConsoleNav =
  | { mode: "state"; active: string; onSelect: (id: string) => void; items: ConsoleNavStateItem[] }
  | { mode: "route"; items: ConsoleNavRouteItem[] };

export type ConsoleBrand = {
  badge: string;
  wordmark: string;
  subtitle: string;
  /** red gradient (club owner) or gold diamond (platform admin). */
  variant?: "red" | "gold";
};

/** Active-item pill style — red gradient (owner hub), gold (owner sub-pages), or
 *  the brand-token outline (admin). */
export type ConsoleAccent = "redGradient" | "gold" | "brand";

const ACTIVE_CLS: Record<ConsoleAccent, string> = {
  redGradient:
    "border border-transparent bg-gradient-to-r from-[#e01e2b] to-[#b3151f] text-white shadow-[0_6px_18px_-8px_rgba(224,30,43,0.5)]",
  gold: "border border-gold/40 bg-gold/[0.08] font-semibold text-gold",
  brand: "border border-brand/40 bg-brand/[0.1] text-brand",
};
const INACTIVE_CLS =
  "border border-transparent text-white/55 hover:bg-white/[0.04] hover:text-white/85";

function Brand({ brand }: { brand: ConsoleBrand }) {
  const gold = brand.variant === "gold";
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl font-display text-base font-bold",
          gold
            ? "bg-gradient-to-br from-[#d4a80f] via-[#f5c518] to-[#ffd54a] text-black shadow-[0_0_20px_rgba(245,197,24,0.25)]"
            : "text-white",
        )}
        style={
          gold
            ? undefined
            : {
                background: "linear-gradient(180deg,#ff2d3f,#b3151f)",
                boxShadow: "0 4px 14px -4px rgba(224,30,43,0.4)",
              }
        }
      >
        {brand.badge}
      </div>
      <div className="leading-tight">
        <div className="font-display text-sm font-bold tracking-wide text-foreground">{brand.wordmark}</div>
        <div className={cn("text-[10px] tracking-[0.28em]", gold ? "uppercase text-gold/70" : "text-white/40")}>
          {brand.subtitle}
        </div>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
  accent,
  grouped,
  showActiveBadge,
  onClick,
  href,
}: {
  label: string;
  icon?: string;
  active: boolean;
  accent: ConsoleAccent;
  grouped: boolean;
  showActiveBadge: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
    active ? ACTIVE_CLS[accent] : INACTIVE_CLS,
  );
  const inner = (
    <>
      {icon &&
        (grouped ? (
          <span className={cn("text-base", active ? "text-brand" : "text-neutral-500")}>{icon}</span>
        ) : (
          <span className="w-5 text-center opacity-80">{icon}</span>
        ))}
      <span className="font-medium">{label}</span>
      {showActiveBadge && active && (
        <span className="ml-auto hidden text-[9px] font-bold uppercase tracking-[0.2em] text-white/70 md:inline">
          Active
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(cls, "shrink-0")}>
      {inner}
    </button>
  );
}

function NavList({
  nav,
  accent,
  showActiveBadge,
  pathname,
}: {
  nav: ConsoleNav;
  accent: ConsoleAccent;
  showActiveBadge: boolean;
  pathname: string;
}) {
  if (nav.mode === "route") {
    const homeHref = nav.items[0]?.href;
    return (
      <>
        {nav.items.map((n) => {
          const active = pathname === n.href || (n.href !== homeHref && pathname.startsWith(n.href));
          return (
            <NavItem
              key={n.href}
              href={n.href}
              label={n.label}
              icon={n.icon}
              active={active}
              accent={accent}
              grouped={false}
              showActiveBadge={showActiveBadge}
            />
          );
        })}
      </>
    );
  }
  const grouped = nav.items.some((n) => n.group);
  if (grouped) {
    const groups = Array.from(new Set(nav.items.map((n) => n.group)));
    return (
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g}>
            {g && (
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
                {g}
              </p>
            )}
            <div className="space-y-0.5">
              {nav.items
                .filter((n) => n.group === g)
                .map((n) => (
                  <NavItem
                    key={n.id}
                    label={n.label}
                    icon={n.icon}
                    active={n.id === nav.active}
                    accent={accent}
                    grouped
                    showActiveBadge={showActiveBadge}
                    onClick={() => nav.onSelect(n.id)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {nav.items.map((n) => (
        <NavItem
          key={n.id}
          label={n.label}
          icon={n.icon}
          active={n.id === nav.active}
          accent={accent}
          grouped={false}
          showActiveBadge={showActiveBadge}
          onClick={() => nav.onSelect(n.id)}
        />
      ))}
    </>
  );
}

export function ConsoleShell({
  brand,
  nav,
  accent = "redGradient",
  topBar,
  header,
  footer,
  backLink,
  collapsible = false,
  showActiveBadge = false,
  sidebarVariant = "plain",
  children,
}: {
  brand?: ConsoleBrand;
  nav: ConsoleNav;
  accent?: ConsoleAccent;
  topBar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  backLink?: ReactNode;
  collapsible?: boolean;
  showActiveBadge?: boolean;
  sidebarVariant?: "plain" | "card";
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const card = sidebarVariant === "card";

  const navBlock = (
    <NavList nav={nav} accent={accent} showActiveBadge={showActiveBadge} pathname={pathname} />
  );

  const sidebarInner = (
    <>
      {brand && (
        <div className="mb-6">
          <Brand brand={brand} />
        </div>
      )}
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 md:hidden"
        >
          Menu <span className="text-white/40">{open ? "▴" : "▾"}</span>
        </button>
      )}
      <nav
        className={cn(
          "gap-1 md:flex-col",
          nav.mode === "state" && !nav.items.some((n) => n.group) ? "flex overflow-x-auto md:overflow-visible" : "",
          collapsible ? (open ? "flex flex-col" : "hidden md:flex md:flex-col") : "flex flex-col",
        )}
      >
        {navBlock}
      </nav>
      {backLink && <div className="mt-6">{backLink}</div>}
      {footer && <div className="mt-4 border-t border-white/[0.06] px-2 pt-4">{footer}</div>}
    </>
  );

  return (
    <div className="min-h-screen text-foreground">
      {topBar}
      <div className="mx-auto flex w-full max-w-[1400px] flex-col md:flex-row md:gap-0">
        <aside
          className={cn(
            "shrink-0",
            card
              ? "px-4 py-6 md:w-64"
              : "border-b border-white/[0.06] px-4 py-5 md:w-[248px] md:border-b-0 md:border-r md:py-8",
          )}
        >
          {card ? <div className={cn(GLASS_PANEL, "sticky top-6 p-4")}>{sidebarInner}</div> : sidebarInner}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {header}
          {children}
        </main>
      </div>
    </div>
  );
}

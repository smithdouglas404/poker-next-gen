"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  loadDashboard,
  money,
  moneyCompact,
  type ActivityRow,
  type DashboardData,
  type TableCard,
  type TournamentRow,
} from "@/features/dashboard/dashboardRpc";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";

/* ================================================================= sidebar */

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/lobby", label: "Live Tables", icon: "cards" },
  { href: "/tournaments", label: "Tournaments", icon: "trophy" },
  { href: "/wallet", label: "Vault", icon: "vault" },
  { href: "/profile", label: "Settings", icon: "cog" },
];

function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  switch (name) {
    case "grid":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "cards":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="4" y="5" width="11" height="15" rx="2" transform="rotate(-8 9 12)" />
          <rect x="9" y="4" width="11" height="15" rx="2" transform="rotate(8 14 11)" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" />
        </svg>
      );
    case "vault":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 8.8V6M12 18v-2.8" />
        </svg>
      );
    default:
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      );
  }
}

function Sidebar({ data }: { data: DashboardData }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-white/[0.06] px-6 py-8 lg:flex">
      <div>
        <div className="mb-12 flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-b from-[#ff2d3f] to-[#b3151f] font-display text-sm font-bold text-white shadow-[0_4px_14px_-4px_rgba(224,30,43,0.5)]">
            GG
          </span>
          <span className="font-display text-xl font-bold uppercase tracking-[0.18em] text-foreground">
            High Rollers
          </span>
        </div>
        <nav className="space-y-1.5">
          {NAV.map((n) => {
            const active = n.href === "/dashboard";
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-[#e01e2b] to-[#b3151f] text-white shadow-[0_6px_18px_-8px_rgba(224,30,43,0.5)]"
                    : "text-muted hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <NavIcon name={n.icon} />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <div className={cn(GLASS_PANEL, "flex items-center gap-3 p-3")}>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#f5c518]/40 to-neutral-700 text-sm font-bold text-white">
            {data.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{data.username}</p>
            <p className="truncate text-[11px] uppercase tracking-wider text-gold/80">
              {data.tier} Status
            </p>
          </div>
        </div>
        <Link
          href="/wallet"
          className={cn(
            BTN_GOLD,
            "flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm uppercase tracking-wide",
          )}
        >
          Deposit Credits
        </Link>
      </div>
    </aside>
  );
}

/* ================================================================== topbar */

function TopBar({ mode }: { mode: DashboardData["mode"] }) {
  return (
    <header className="flex items-center justify-between gap-4 pb-8">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-bold uppercase italic tracking-wide text-foreground">
          High Rollers Club
        </h1>
        <ModeBadge mode={mode} />
      </div>
      <div className="flex items-center gap-3">
        <label className="hidden items-center gap-2 rounded-xl border border-white/[0.06] bg-surface px-4 py-2.5 sm:flex">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            type="text"
            placeholder="Find a table…"
            className="w-44 bg-transparent text-sm text-white placeholder:text-neutral-600 outline-none"
          />
        </label>
        <Link
          href="/loyalty"
          aria-label="Notifications"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-surface text-neutral-300 transition hover:text-brand"
        >
          <span className="relative">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.5 21a2 2 0 0 0 3 0" />
            </svg>
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand" />
          </span>
        </Link>
        <Link
          href="/wallet"
          aria-label="Vault"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-surface text-neutral-300 transition hover:text-gold"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M3 10 12 4l9 6M5 10v9h14v-9M9 19v-5h6v5" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

function ModeBadge({ mode }: { mode: DashboardData["mode"] }) {
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-green/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-green">
        <span className="h-1.5 w-1.5 rounded-full bg-green" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-gold">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      Demo Data
    </span>
  );
}

/* ========================================================== profile + standing */

function Stat({ label, value, accent }: { label: string; value: string; accent?: "green" | "gold" }) {
  return (
    <div>
      <p className={cn(HEADING_SM, "mb-1 text-neutral-500")}>{label}</p>
      <p
        className={cn(
          "font-display text-3xl font-bold tracking-tight",
          accent === "green" ? "text-green" : accent === "gold" ? "text-gold" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OperativeProfileCard({ data }: { data: DashboardData }) {
  const [dollars, cents] = money(data.bankrollCents).split(".");
  return (
    <section className={cn(GLASS_PANEL, "relative overflow-hidden p-8")}>
      {/* faint gem glyph, upper-right (matches master) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-2 top-6 h-40 w-40 text-white/[0.04]"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M6 3h12l3 5-9 13L3 8l3-5Zm0 0 3 5m9-5-3 5M3 8h18M12 21 9 8m3 13 3-13" stroke="currentColor" fill="none" strokeWidth={0.8} />
      </svg>

      <p className={cn(HEADING_SM, "mb-4 text-muted")}>Operative Profile</p>
      <h2 className="font-display text-4xl font-bold uppercase tracking-tight text-white sm:text-5xl">
        {data.personaTitle}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">{data.standingBlurb}</p>

      <div className="mt-8 flex flex-wrap gap-12 border-t border-white/[0.06] pt-6">
        <div>
          <p className={cn(HEADING_SM, "mb-1 text-neutral-500")}>Total Bankroll</p>
          <p className="font-display text-3xl font-bold tracking-tight text-gold sm:text-4xl">
            {dollars}
            <span className="text-gold/70">.{cents ?? "00"}</span>
          </p>
        </div>
        <Stat label="Win Rate" value={`${data.winRatePct.toFixed(1)}%`} accent="green" />
      </div>
    </section>
  );
}

function GlobalStandingCard({ data }: { data: DashboardData }) {
  const live = data.mode === "live";
  return (
    <section
      className={cn(
        GLASS_PANEL,
        "relative flex flex-col overflow-hidden p-6",
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
            live
              ? "border border-green/30 bg-green/10 text-green"
              : "border border-gold/30 bg-gold/10 text-gold",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-green" : "bg-gold")} />
          {live ? "System Online" : "Demo Mode"}
        </span>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="text-muted">
          <path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" />
        </svg>
      </div>

      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Global Standing</h3>

      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-neutral-400">Current Rank</span>
        <span className="font-semibold text-white">{data.rankName}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0a7d43] to-[#22c55e]"
          style={{ width: `${Math.round(data.rankProgress * 100)}%` }}
        />
      </div>

      {data.globalRank !== null && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-neutral-400">Winnings Ladder</span>
          <span className="font-display font-bold text-gold">#{data.globalRank}</span>
        </div>
      )}

      <div className="mt-auto border-t border-white/[0.06] pt-5">
        <p className={cn(HEADING_SM, "mb-1.5 text-neutral-500")}>Next Reward</p>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-white">
          {data.nextReward}
        </p>
      </div>
    </section>
  );
}

/* ============================================================ high-stakes tables */

const TABLE_TINTS = [
  "from-[#2a1416] to-[#12151a]",
  "from-[#2a2410] to-[#12151a]",
  "from-[#122019] to-[#12151a]",
  "from-[#1c1f24] to-[#12151a]",
];

function TableCardView({ card, index }: { card: TableCard; index: number }) {
  return (
    <article className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex flex-col overflow-hidden")}>
      <div className={cn("relative h-32 bg-gradient-to-br", TABLE_TINTS[index % TABLE_TINTS.length])}>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur">
          <span className={cn("h-1.5 w-1.5 rounded-full", card.full ? "bg-neutral-500" : "bg-green")} />
          {card.suite}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-display text-base font-bold uppercase tracking-wide text-white">{card.name}</h4>
            <p className="mt-0.5 text-xs text-neutral-500">{card.stakes}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">
              {card.full ? "Status" : "Pot"}
            </p>
            <p className={cn("font-display text-sm font-bold", card.full ? "text-neutral-400" : "text-green")}>
              {card.full ? "Full" : card.potCents > 0 ? moneyCompact(card.potCents) : `${card.seated} seated`}
            </p>
          </div>
        </div>

        {/* seat pips */}
        <div className="mt-3 flex items-center gap-1.5">
          {Array.from({ length: Math.min(6, card.seated + card.openSeats) || 6 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-6 w-6 rounded-full border",
                i < card.seated
                  ? "border-green/40 bg-green/20"
                  : "border-white/10 bg-white/[0.03]",
              )}
            />
          ))}
          {card.openSeats > 0 && !card.full && (
            <span className="ml-1 text-[11px] text-neutral-500">+{card.openSeats} open</span>
          )}
        </div>

        <Link
          href={card.full ? `/table?spectate=${card.matchId}` : `/table?match=${card.matchId}`}
          className={cn(
            "mt-4 flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
            card.full
              ? "cursor-default border border-white/10 text-neutral-500"
              : "border border-brand/50 bg-brand/15 text-white hover:bg-brand/25",
          )}
        >
          {card.full ? "Spectate Only" : "Enter Table"}
        </Link>
      </div>
    </article>
  );
}

function HighStakes({ tables }: { tables: TableCard[] }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-white">Active High Stakes</h3>
          <p className="text-xs uppercase tracking-widest text-neutral-500">Live data feed from exclusive suites</p>
        </div>
        <Link href="/lobby" className="text-xs font-bold uppercase tracking-widest text-brand hover:text-brand/80">
          View All Tables
        </Link>
      </div>
      {tables.length === 0 ? (
        <div className={cn(GLASS_PANEL, "p-8 text-center text-sm text-neutral-500")}>
          No high-stakes suites are live right now — check back shortly.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.slice(0, 3).map((t, i) => (
            <TableCardView key={t.matchId} card={t} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================= elite tournaments */

function TournamentRowView({ row }: { row: TournamentRow }) {
  return (
    <Link
      href={`/tournaments?event=${row.id}`}
      className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex items-center gap-4 p-4")}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gold">{row.monthLabel}</span>
        <span className="font-display text-xl font-bold leading-none text-white">{row.dayLabel}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="truncate font-display text-base font-bold uppercase tracking-wide text-white">{row.name}</h4>
        <p className="truncate text-xs text-neutral-500">{row.subtitle}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Buy-in</p>
        <p className="font-display text-base font-bold text-white">{money(row.buyInCents)}</p>
      </div>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-muted">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}

function EliteTournaments({ rows }: { rows: TournamentRow[] }) {
  return (
    <section>
      <h3 className="mb-4 font-display text-xl font-bold uppercase tracking-wide text-white">Elite Tournaments</h3>
      {rows.length === 0 ? (
        <div className={cn(GLASS_PANEL, "p-8 text-center text-sm text-neutral-500")}>
          No elite events on the schedule yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <TournamentRowView key={r.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================== recent activity */

function ActivityIcon({ kind }: { kind: ActivityRow["kind"] }) {
  const map = {
    credit: { ring: "border-green/30 text-green", glyph: "M12 5v14M5 12h14" },
    win: { ring: "border-gold/30 text-gold", glyph: "M7 4h10v4a5 5 0 0 1-10 0V4ZM9 20h6M12 13v4" },
    loss: { ring: "border-brand/30 text-brand", glyph: "M12 8v5M12 16.5v.01M12 3 2 20h20L12 3Z" },
    neutral: { ring: "border-white/15 text-muted", glyph: "M5 12h14" },
  } as const;
  const m = map[kind];
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-black/30", m.ring)}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d={m.glyph} />
      </svg>
    </span>
  );
}

function RecentActivity({ rows }: { rows: ActivityRow[] }) {
  return (
    <section className={cn(GLASS_PANEL, "flex flex-col p-6")}>
      <h3 className="mb-5 font-display text-lg font-bold uppercase tracking-wide text-white">Recent Activity</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No wallet movements yet — your ledger is clean.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="flex gap-3">
              <ActivityIcon kind={r.kind} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold uppercase tracking-wide text-white">{r.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{r.detail}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-neutral-600">{r.when}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link
        href="/wallet"
        className="mt-6 border-t border-white/[0.06] pt-4 text-center text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-500 transition hover:text-brand"
      >
        Full History Log
      </Link>
    </section>
  );
}

/* ===================================================================== page */

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-64 rounded-2xl bg-white/[0.03]" />
        <div className="h-64 rounded-2xl bg-white/[0.03]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-72 rounded-2xl bg-white/[0.03]" />
        <div className="h-72 rounded-2xl bg-white/[0.03]" />
        <div className="h-72 rounded-2xl bg-white/[0.03]" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDashboard().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shellData = useMemo(
    () =>
      data ?? {
        mode: "demo" as const,
        username: "Operative",
        tier: "member",
      },
    [data],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1500px]">
        <Sidebar data={shellData as DashboardData} />

        <main className="flex-1 px-6 py-8 sm:px-10">
          <TopBar mode={data?.mode ?? "demo"} />

          {!data ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-10">
              <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                <OperativeProfileCard data={data} />
                <GlobalStandingCard data={data} />
              </div>

              <HighStakes tables={data.tables} />

              <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
                <EliteTournaments rows={data.tournaments} />
                <RecentActivity rows={data.activity} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

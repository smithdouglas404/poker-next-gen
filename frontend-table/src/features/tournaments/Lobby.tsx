"use client";

import { useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

import { Eyebrow, KpiTile, RowIcon, Stat, Tag } from "./atoms";
import { FocusRail } from "./FocusRail";
import { countdown, dollars, msUntil, startsLabel } from "./format";
import { useNow } from "./useNow";
import type { BlindLevel, EnrichedTournament, LeaderEntry, LobbyMeta } from "./types";

const GLYPH: Record<NonNullable<LobbyMeta["tagTone"]>, string> = {
  gold: "★",
  cyan: "⚡",
  green: "◈",
  purple: "◆",
  red: "!",
};

type SortKey = "time" | "prize" | "buyin";
type FilterKey = "all" | "running" | "upcoming" | "satellite";

function prizePoolMinor(t: EnrichedTournament, registered: number): number {
  return registered * t.buy_in_minor;
}

function CountdownPill({ scheduledAt, status }: { scheduledAt: string; status: string }) {
  useNow(1000);
  if (status === "running") {
    return <span className="font-display text-lg font-bold text-emerald-300">LIVE</span>;
  }
  const ms = msUntil(scheduledAt);
  return (
    <span className="font-display text-lg font-bold tabular-nums text-cyan">
      {ms > 0 ? countdown(ms) : "Starting"}
    </span>
  );
}

function HeroCard({
  t,
  registered,
  onRegister,
  onSelect,
  selected,
  busy,
  isRegistered,
}: {
  t: EnrichedTournament;
  registered: number;
  onRegister: (id: string) => void;
  onSelect: (id: string) => void;
  selected: boolean;
  busy: boolean;
  isRegistered: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-6 text-left transition-all duration-300",
        selected ? "border-cyan/50 shadow-[0_0_28px_rgba(129,236,255,0.12)]" : "border-white/[0.08] hover:border-white/20",
      )}
      style={{ background: t.meta?.heroArt ?? "linear-gradient(135deg,#111318,#05070c)" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/30" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {t.meta?.tag && <Tag tone={t.meta.tagTone}>{t.meta.tag}</Tag>}
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            {startsLabel(t.scheduled_at, t.status)}
          </span>
        </div>
        <h3 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-white">
          {t.name}
        </h3>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Stat label="Prize Pool" tone="cyan" value={dollars(prizePoolMinor(t, registered), { compact: true })} />
          <Stat label="Buy-in" tone="gold" value={dollars(t.buy_in_minor, { compact: true })} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Players</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-white">
              {registered}/{t.max_players}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {t.status === "running" ? "Status" : "Starts in"}
            </p>
            <p className="mt-1">
              <CountdownPill scheduledAt={t.scheduled_at} status={t.status} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span
            role="button"
            tabIndex={-1}
            aria-disabled={busy || isRegistered || t.meta?.locked}
            onClick={(e) => {
              e.stopPropagation();
              if (!busy && !isRegistered && !t.meta?.locked) onRegister(t.id);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-bold uppercase tracking-wide transition-all",
              isRegistered
                ? "cursor-default border border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : t.meta?.locked
                  ? "cursor-not-allowed border border-white/10 text-neutral-600"
                  : BTN_GOLD,
              busy && "opacity-50",
            )}
          >
            {isRegistered ? "Registered ✓" : t.meta?.locked ? "Locked" : "Register Now"}
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 group-hover:text-cyan">
            View Details →
          </span>
        </div>
      </div>
    </button>
  );
}

function EventRow({
  t,
  registered,
  onRegister,
  onSelect,
  onWatch,
  selected,
  busy,
  isRegistered,
}: {
  t: EnrichedTournament;
  registered: number;
  onRegister: (id: string) => void;
  onSelect: (id: string) => void;
  onWatch: (id: string) => void;
  selected: boolean;
  busy: boolean;
  isRegistered: boolean;
}) {
  const tone = t.meta?.tagTone ?? "cyan";
  const playersLabel =
    t.status === "running" && t.meta?.lateReg
      ? `${registered} left`
      : `${registered} / ${t.max_players}`;
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border p-3.5 transition-all",
        selected ? "border-cyan/40 bg-cyan/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15",
      )}
    >
      <RowIcon tone={tone} glyph={GLYPH[tone]} />
      <button type="button" onClick={() => onSelect(t.id)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-white">{t.name}</p>
          {t.meta?.lateReg && <Tag tone="green">Late Reg</Tag>}
          {t.meta?.satelliteOf && <Tag tone="cyan">Sat</Tag>}
          {t.meta?.locked && <Tag tone="purple">Locked</Tag>}
        </div>
        <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.12em] text-neutral-500">
          {t.meta?.format ?? t.variant}
          {t.meta?.speed ? ` · ${t.meta.speed}` : ""}
          {t.meta?.satelliteOf ? ` · ${t.meta.satelliteOf}` : ""}
          {` · ${startsLabel(t.scheduled_at, t.status)}`}
        </p>
      </button>
      <div className="hidden items-center gap-6 md:flex">
        <Stat label="Buy-in" value={dollars(t.buy_in_minor, { compact: true })} className="text-right" />
        <Stat
          label="Prize Pool"
          tone="green"
          value={dollars(prizePoolMinor(t, registered), { compact: true })}
          className="text-right"
        />
        <div className="w-16 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Players</p>
          <p className="mt-1 font-display text-sm font-bold tabular-nums text-white">{playersLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onWatch(t.id)} disabled={busy}>
          Watch
        </Button>
        <Button
          size="sm"
          variant={isRegistered ? "outline" : "gold"}
          disabled={busy || isRegistered || t.meta?.locked}
          onClick={() => onRegister(t.id)}
        >
          {isRegistered ? "Joined" : t.meta?.locked ? "Locked" : "Register"}
        </Button>
      </div>
    </div>
  );
}

export function Lobby({
  tournaments,
  registeredCounts,
  registeredByMe,
  selectedId,
  onSelect,
  onRegister,
  onWatch,
  focusLeaders,
  focusLevels,
  demo,
  busy,
  totalPrizeMinor,
}: {
  tournaments: EnrichedTournament[];
  registeredCounts: Record<string, number>;
  registeredByMe: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRegister: (id: string) => void;
  onWatch: (id: string) => void;
  focusLeaders: LeaderEntry[];
  focusLevels: BlindLevel[];
  demo: boolean;
  busy: boolean;
  totalPrizeMinor: number;
}) {
  const [sort, setSort] = useState<SortKey>("time");
  const [filter, setFilter] = useState<FilterKey>("all");

  const reg = (id: string) => registeredCounts[id] ?? 0;

  const featured = tournaments.filter((t) => t.meta?.featured).slice(0, 2);
  const featuredIds = new Set(featured.map((t) => t.id));

  const rows = useMemo(() => {
    let list = tournaments.filter((t) => !featuredIds.has(t.id) && t.status !== "finished");
    if (filter === "running") list = list.filter((t) => t.status === "running");
    else if (filter === "upcoming") list = list.filter((t) => t.status !== "running");
    else if (filter === "satellite") list = list.filter((t) => t.meta?.satelliteOf);
    const sorted = [...list];
    if (sort === "prize") sorted.sort((a, b) => prizePoolMinor(b, reg(b.id)) - prizePoolMinor(a, reg(a.id)));
    else if (sort === "buyin") sorted.sort((a, b) => b.buy_in_minor - a.buy_in_minor);
    else sorted.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournaments, filter, sort, registeredCounts]);

  const selected = tournaments.find((t) => t.id === selectedId) ?? null;
  const activeTables = tournaments.filter((t) => t.status === "running").length * 12 + 24;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Main column */}
      <div className="min-w-0 space-y-8">
        {/* Intro + KPIs */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Exclusive Events</Eyebrow>
            <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-tight text-white">
              High Rollers Club
            </h1>
            <p className="mt-2 max-w-lg text-sm text-neutral-400">
              Where legends are made and fortunes are forged. Access the highest-stakes tournaments in the
              digital vault.
            </p>
          </div>
          <div className="flex gap-3">
            <KpiTile label="Active Tables" value={activeTables.toLocaleString()} tone="cyan" />
            <KpiTile
              label="Total Prize Pool"
              value={dollars(totalPrizeMinor, { compact: true })}
              tone="gold"
            />
          </div>
        </div>

        {/* Featured hero events */}
        {featured.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
              <span className="text-cyan">★</span> Featured Events
            </h2>
            <div className={cn("grid gap-4", featured.length > 1 ? "md:grid-cols-2" : "")}>
              {featured.map((t) => (
                <HeroCard
                  key={t.id}
                  t={t}
                  registered={reg(t.id)}
                  onRegister={onRegister}
                  onSelect={onSelect}
                  selected={selectedId === t.id}
                  busy={busy}
                  isRegistered={registeredByMe.has(t.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Ongoing & Upcoming */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
              <span className="text-cyan">≡</span> Ongoing &amp; Upcoming
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                {(["all", "running", "upcoming", "satellite"] as FilterKey[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                      filter === f ? "bg-cyan/15 text-cyan" : "text-neutral-500 hover:text-neutral-300",
                    )}
                  >
                    {f === "all" ? "All" : f === "running" ? "Live" : f === "upcoming" ? "Soon" : "Sat"}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 outline-none focus:border-cyan/40"
              >
                <option value="time">Sort: Time</option>
                <option value="prize">Sort: Prize</option>
                <option value="buyin">Sort: Buy-in</option>
              </select>
            </div>
          </div>
          <div className="space-y-2.5">
            {rows.length === 0 && (
              <div className={cn(GLASS_PANEL, "p-6 text-sm text-neutral-500")}>
                No tournaments match this filter.
              </div>
            )}
            {rows.map((t) => (
              <EventRow
                key={t.id}
                t={t}
                registered={reg(t.id)}
                onRegister={onRegister}
                onSelect={onSelect}
                onWatch={onWatch}
                selected={selectedId === t.id}
                busy={busy}
                isRegistered={registeredByMe.has(t.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Focus rail */}
      <aside className={cn("lg:sticky lg:top-6 lg:self-start", GLASS_PANEL_HOVER)}>
        <FocusRail
          tournament={selected}
          leaders={focusLeaders}
          levels={focusLevels}
          live={selected?.status === "running"}
          demo={demo}
        />
      </aside>
    </div>
  );
}

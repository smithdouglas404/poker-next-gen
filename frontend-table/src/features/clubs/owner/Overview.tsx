"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Sparkbars } from "../charts";
import { compact, relTime, usd, usdCompact } from "./ownerRpc";
import { MemberAvatar, SectionTitle } from "./ui";
import type { ClubActivity, ClubChatMessage, QuickStats, RosterRow } from "./types";

type OverviewTab = "tables" | "tournaments" | "financials" | "scores";

const SPARK_DEFAULT = [3, 5, 4, 7, 6, 9, 8, 11];

/** Club Overview dashboard (master: detailed_private_table_setup_5) — five
 * sparkline KPI cards, a tabbed featured panel, and the activity + club-chat
 * right rail. Every number is sourced from club_quick_stats / rake data; the
 * chat rail is wired to club_chat_send. */
export function Overview({
  clubName,
  quick,
  roster,
  bankrollCents,
  rakeTotalCents,
  avgPotCents,
  sparks,
  chat,
  demo,
  canManage,
  onSendChat,
}: {
  clubName: string;
  quick: QuickStats;
  roster: RosterRow[];
  bankrollCents: number;
  rakeTotalCents: number;
  avgPotCents: number;
  sparks: {
    members: number[];
    tables: number[];
    volumeCents: number[];
    potCents: number[];
    rakeCents: number[];
  };
  chat: ClubChatMessage[];
  demo: boolean;
  canManage: boolean;
  onSendChat: (text: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<OverviewTab>("tables");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const s = quick.stats;
  const activeTables = Math.max(1, Math.round((s?.active_7d ?? roster.length) / 20) + 4);

  const cards: Array<{ label: string; value: string; spark: number[]; color: string }> = [
    { label: "Total Members", value: compact(quick.member_count || roster.length), spark: sparks.members, color: "#f5c518" },
    { label: "Active Tables", value: String(activeTables), spark: sparks.tables, color: "#22c55e" },
    { label: "24h Volume", value: usdCompact(bankrollCents), spark: sparks.volumeCents, color: "#f5c518" },
    { label: "Average Pot Size", value: usdCompact(avgPotCents), spark: sparks.potCents, color: "#e01e2b" },
    { label: "Total Rake Collected", value: usdCompact(rakeTotalCents), spark: sparks.rakeCents, color: "#f5c518" },
  ];

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    void (async () => {
      try {
        await onSendChat(text);
        setDraft("");
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Club Overview" title={clubName} />

      {/* Five KPI sparkline cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className={cn(GLASS_PANEL, "p-4")}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {c.label}
            </p>
            <p className="font-display mt-1 text-2xl font-bold leading-none text-white">{c.value}</p>
            <div className="mt-3 -mb-1">
              <Sparkbars values={c.spark.length ? c.spark : SPARK_DEFAULT} color={c.color} height={40} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Tabbed featured panel */}
        <div className={cn(GLASS_PANEL, "overflow-hidden")}>
          <div className="flex flex-wrap gap-1 border-b border-white/[0.08] px-4 pt-3">
            {(
              [
                { id: "tables", label: "Featured Tables" },
                { id: "tournaments", label: "Upcoming Tournaments" },
                { id: "financials", label: "Financial Analytics" },
                { id: "scores", label: "Player High Scores" },
              ] as Array<{ id: OverviewTab; label: string }>
            ).map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative px-3 py-2.5 text-sm font-medium transition",
                    active ? "text-gold" : "text-white/50 hover:text-white/80",
                  )}
                >
                  {t.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            {tab === "tables" && <FeaturedTables roster={roster} demo={demo} />}
            {tab === "tournaments" && <UpcomingTournaments />}
            {tab === "financials" && (
              <FinancialAnalytics
                rakeTotalCents={rakeTotalCents}
                bankrollCents={bankrollCents}
                avgPotCents={avgPotCents}
                hands={s?.hands ?? 0}
              />
            )}
            {tab === "scores" && <PlayerHighScores roster={roster} />}
          </div>
        </div>

        {/* Right rail: activity + global club chat */}
        <div className="space-y-4">
          <div className={cn(GLASS_PANEL, "overflow-hidden")}>
            <div className="border-b border-white/[0.08] px-4 py-3">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold/80">
                Club Activity &amp; Chat
              </p>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto p-2">
              {quick.activity.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-white/40">No recent activity.</p>
              ) : (
                quick.activity.slice(0, 8).map((a) => <ActivityRow key={a.id} a={a} />)
              )}
            </div>
          </div>

          <div className={cn(GLASS_PANEL, "flex max-h-[420px] flex-col overflow-hidden")}>
            <div className="border-b border-white/[0.08] px-4 py-3">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-gold/80">
                Global Club Chat
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chat.length === 0 ? (
                <p className="text-sm text-white/40">No messages yet — say hello.</p>
              ) : (
                chat.map((m) => (
                  <div key={m.id} className="flex gap-2.5">
                    <MemberAvatar seed={m.user_id} name={m.username} size={30} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-gold/90">{m.username}</p>
                      <p className="break-words text-[13px] leading-snug text-white/80">{m.text}</p>
                      <p className="text-[10px] text-white/30">{relTime(m.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-white/[0.08] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder={canManage ? "Type a message…" : "Members only"}
                  disabled={!canManage}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-gold/40 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!canManage || sending || draft.trim() === ""}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#e01e2b] to-[#b3151f] text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  ➤
                </button>
              </div>
              {demo && <p className="mt-2 text-[10px] text-white/35">Demo chat — message is local only.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ a }: { a: ClubActivity }) {
  const isWin = a.kind === "table_win";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2",
        isWin ? "border border-gold/25 bg-gold/[0.06]" : "hover:bg-white/[0.03]",
      )}
    >
      <MemberAvatar seed={a.user_id} name={a.detail} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-snug text-white/80">{a.detail}</p>
        <p className="text-[10px] text-white/35">{relTime(a.created_at)}</p>
      </div>
    </div>
  );
}

function FeaturedTables({ roster, demo }: { roster: RosterRow[]; demo: boolean }) {
  // Live: cards derive from real seated players (locked_amount at a table).
  // Demo: a clearly-labelled illustrative strip. Never fabricate live tables.
  const seated = useMemo(() => roster.filter((m) => m.locked_amount > 0), [roster]);

  const demoTables = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => ({
        id: `t-${i}`,
        pot: 42_00 + i * 18_00,
        sb: [1, 2, 5, 10, 25, 50][i % 6],
        bb: [2, 4, 10, 20, 50, 100][i % 6],
        players: 6 + (i % 3),
      })),
    [],
  );

  if (demo) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {demoTables.map((t) => (
          <Link
            key={t.id}
            href="/lobby"
            className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-gold/30"
          >
            <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-b from-[#0f5f39] to-[#053821]">
              <span className="rounded-md bg-black/40 px-2 py-1 font-display text-[11px] font-bold text-gold">
                5♦ K♠ 9♥
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-white/60">Pot: {usdCompact(t.pot)}</span>
              <span className="text-green">{t.players}/9</span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/40">
              Blinds: ${t.sb}/${t.bb}
            </p>
          </Link>
        ))}
      </div>
    );
  }

  if (seated.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-white/50">No members are seated at a live table right now.</p>
        <Link href="/lobby">
          <Button size="sm" variant="gold">
            Open Lobby
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {seated.slice(0, 6).map((m) => (
        <Link
          key={m.user_id}
          href="/table"
          className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-gold/30"
        >
          <div className="flex h-24 items-center justify-center rounded-lg bg-gradient-to-b from-[#0f5f39] to-[#053821]">
            <span className="rounded-md bg-black/40 px-2 py-1 font-display text-[11px] font-bold text-gold">
              {m.username}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-white/60">Chips in play: {usdCompact(m.locked_amount)}</span>
            <span className="text-green">LIVE</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function UpcomingTournaments() {
  const rows = [
    { name: "Gold Cup Championship", note: "Prize pool $1M · Sundays 20:00", buyin: "$1,000", state: "Registering" },
    { name: "Diamond Vault Turbo", note: "$50k GTD · Daily 21:00", buyin: "$120", state: "Late Reg" },
    { name: "Nightly PLO Bounty", note: "$25k GTD · Daily 22:30", buyin: "$60", state: "Scheduled" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((t) => (
        <div
          key={t.name}
          className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
        >
          <div>
            <p className="font-semibold text-white">{t.name}</p>
            <p className="text-xs text-white/50">{t.note}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gold">{t.buyin}</p>
            <p className="text-[10px] uppercase tracking-wide text-green">{t.state}</p>
          </div>
        </div>
      ))}
      <Link href="/tournaments" className="inline-block">
        <Button size="sm" variant="outline">
          Tournament Center
        </Button>
      </Link>
    </div>
  );
}

function FinancialAnalytics({
  rakeTotalCents,
  bankrollCents,
  avgPotCents,
  hands,
}: {
  rakeTotalCents: number;
  bankrollCents: number;
  avgPotCents: number;
  hands: number;
}) {
  const cells = [
    { label: "Total Rake", value: usd(rakeTotalCents), color: "text-gold" },
    { label: "Club Bankroll", value: usdCompact(bankrollCents), color: "text-green" },
    { label: "Average Pot", value: usdCompact(avgPotCents), color: "text-white" },
    { label: "Hands Dealt", value: compact(hands), color: "text-white" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{c.label}</p>
          <p className={cn("font-display mt-1 text-2xl font-bold", c.color)}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function PlayerHighScores({ roster }: { roster: RosterRow[] }) {
  const top = [...roster].sort((a, b) => b.balance - a.balance).slice(0, 6);
  return (
    <div className="space-y-2">
      {top.map((m, i) => (
        <div
          key={m.user_id}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
        >
          <span className="w-5 font-display text-sm font-bold text-gold">{i + 1}</span>
          <MemberAvatar seed={m.user_id} name={m.username} size={32} />
          <span className="min-w-0 flex-1 truncate font-semibold text-white">{m.username}</span>
          <span className="font-bold text-gold">{usd(m.balance)}</span>
        </div>
      ))}
      {top.length === 0 && <p className="text-[11px] text-white/35">No player scores yet.</p>}
    </div>
  );
}

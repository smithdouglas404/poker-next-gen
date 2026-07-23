"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Chip, NeonSection, PreviewTile } from "@/features/commandcore/kit";
import { listTournaments, tournamentBalance, tournamentStatus } from "@/features/tournaments/api";
import type { Tournament } from "@/features/tournaments/types";
import { walletApi, type NowPaymentsBalanceEntry } from "@/features/wallet/walletRpc";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// NEXUS OS :: Live Cyber-Deck. An in-game operator overview: every live table at
// a glance, running tournaments with one-click balance/merge, an announce-all
// broadcast, and the treasury readout. Per-table live controls (pause / force
// fold / move seat) run over that table's match socket, so each card links into
// the table where the in-table admin panel drives them. Pieces that aren't wired
// (live per-player cashier, inspect hole cards, manual pot re-allocation) show as
// Preview tiles.

interface TableRow {
  match_id: string;
  room_id?: string;
  seated?: number;
  open_seats?: number;
  sb?: number;
  bb?: number;
  status?: string;
}

interface TourStat {
  t: Tournament;
  players_left?: number;
  level?: number;
  tables?: number;
}

const money = (cents?: number) => (cents == null ? "—" : `$${(cents / 100).toLocaleString()}`);

export default function CyberDeckPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [tours, setTours] = useState<TourStat[]>([]);
  const [treasury, setTreasury] = useState<NowPaymentsBalanceEntry[] | null>(null);
  const [balancing, setBalancing] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [freezing, setFreezing] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const res = (await callSessionRpc("table_list", {})) as { matches?: Array<{ match_id: string; label?: string }> };
      const rows: TableRow[] = (res.matches ?? []).map((m) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = m.label ? (JSON.parse(m.label) as Record<string, unknown>) : {};
        } catch {
          /* label not JSON */
        }
        return {
          match_id: m.match_id,
          room_id: parsed.room_id as string | undefined,
          seated: parsed.seated as number | undefined,
          open_seats: parsed.open_seats as number | undefined,
          sb: parsed.sb as number | undefined,
          bb: parsed.bb as number | undefined,
          status: parsed.status as string | undefined,
        };
      });
      setTables(rows);
    } catch {
      /* transient */
    }
  }, []);

  const loadTours = useCallback(async () => {
    try {
      const all = await listTournaments();
      const running = all.filter((t) => t.status === "running");
      const stats = await Promise.all(
        running.map(async (t) => {
          try {
            const s = await tournamentStatus(t.id);
            return { t, players_left: s.players_left, level: s.level, tables: (s.tables ?? []).length };
          } catch {
            return { t };
          }
        }),
      );
      setTours(stats);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void loadTables();
    void loadTours();
    void (async () => {
      try {
        const t = await walletApi.nowpaymentsBalance();
        if (t.configured) setTreasury(t.balances ?? []);
      } catch {
        /* admin-only */
      }
    })();
    const id = window.setInterval(() => {
      void loadTables();
      void loadTours();
    }, 6000);
    return () => window.clearInterval(id);
  }, [loadTables, loadTours]);

  async function balance(id: string) {
    setBalancing(id);
    setFlash(null);
    try {
      await tournamentBalance(id);
      setFlash("Balancing requested — the director is rebalancing tables.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Balance failed.");
    } finally {
      setBalancing(null);
    }
  }

  async function toggleFreeze() {
    setFreezing(true);
    setFlash(null);
    try {
      const next = !frozen;
      await callSessionRpc("tables_freeze_all", { resume: !next });
      setFrozen(next);
      setFlash(next ? "All tables frozen — dealing paused platform-wide." : "All tables resumed.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Freeze failed (admin only).");
    } finally {
      setFreezing(false);
    }
  }

  async function sendAnnounce() {
    if (!announce.trim()) return;
    setFlash(null);
    try {
      await callSessionRpc("announcement_create", {
        title: "Broadcast",
        body: announce.trim(),
        severity: "info",
        audience: "all",
        duration_hours: 1,
      });
      setAnnounce("");
      setFlash("Broadcast sent to all players.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Broadcast failed (admin only).");
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(129,236,255,0.06),transparent),radial-gradient(900px_500px_at_90%_0%,rgba(212,175,55,0.05),transparent)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className={cn(GLASS_PANEL, "mb-6 flex flex-wrap items-center justify-between gap-3 border-cyan/20 p-4")}>
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-cyan">NEXUS OS · Live Cyber-Deck</p>
            <h1 className="mt-0.5 font-display text-xl font-bold uppercase tracking-wider text-white">Operator Console</h1>
          </div>
          <div className="flex items-center gap-2">
            <Chip label={`${tables.length} live tables`} />
            <Chip label={`${tours.length} running events`} />
            <Link href="/command-core" className="text-xs text-cyan hover:underline">
              + New session
            </Link>
          </div>
        </div>

        {flash && (
          <div className={cn(GLASS_PANEL, "mb-4 border-cyan/20 px-4 py-2 text-sm text-neutral-200")}>{flash}</div>
        )}

        <div className="space-y-6">
          {/* Live table matrix */}
          <NeonSection title="Live Table Matrix" right={<span className="text-[11px] text-neutral-500">auto-refresh 6s</span>}>
            {tables.length === 0 ? (
              <p className="text-sm text-neutral-500">No live tables right now.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tables.map((t) => (
                  <div key={t.match_id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-sm text-gold">{t.room_id ?? t.match_id.slice(0, 8)}</p>
                      <span className="rounded-full border border-cyan/30 bg-cyan/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan">
                        {t.status ?? "live"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
                      <span>Blinds {money(t.sb)}/{money(t.bb)}</span>
                      <span className="text-right">Seated {t.seated ?? 0}</span>
                      <span>Open seats {t.open_seats ?? 0}</span>
                      <span className="text-right">
                        <Link href="/table" className="text-cyan hover:underline">Manage →</Link>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-neutral-500">
              Pause / force-fold / move-seat run over each table&apos;s socket — open a table to drive them from its admin panel.
            </p>
          </NeonSection>

          {/* Running tournaments — balance / merge */}
          <NeonSection title="Tournament Control">
            {tours.length === 0 ? (
              <p className="text-sm text-neutral-500">No running tournaments.</p>
            ) : (
              <div className="space-y-2">
                {tours.map(({ t, players_left, level, tables: nTables }) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-[11px] text-neutral-400">
                        Level {level ?? "—"} · {players_left ?? "—"} left · {nTables ?? "—"} tables
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={balancing === t.id}
                      onClick={() => balance(t.id)}
                      className="rounded-lg border border-cyan/40 bg-cyan/[0.08] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan hover:bg-cyan/[0.16] disabled:opacity-50"
                    >
                      {balancing === t.id ? "Balancing…" : "⚖ Balance / Merge"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </NeonSection>

          {/* Financial HUD + override toolkit */}
          <div className="grid gap-6 lg:grid-cols-2">
            <NeonSection title="Treasury & Cashier">
              <p className="text-[11px] uppercase tracking-wider text-muted">Host treasury (NOWPayments)</p>
              {treasury === null ? (
                <p className="mt-1 text-sm text-neutral-500">Operator-only — hidden.</p>
              ) : treasury.length === 0 ? (
                <p className="mt-1 text-2xl font-bold text-green">$0.00</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {treasury.slice(0, 6).map((t) => (
                    <span key={t.currency} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm">
                      <span className="text-muted">{t.currency}</span> <span className="font-semibold text-green">{t.amount}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <PreviewTile title="Live per-player cashier (wallet · stack · net · status)" caption="Cross-table player financials + auto-escrow rebuy/cashout — requires the escrow layer." />
              </div>
            </NeonSection>

            <NeonSection title="Admin Override Toolkit">
              <label className="block text-[11px] uppercase tracking-wider text-muted">Announce to all players</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={announce}
                  onChange={(e) => setAnnounce(e.target.value)}
                  placeholder="Message broadcast to every table…"
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan/50"
                />
                <button
                  type="button"
                  disabled={!announce.trim()}
                  onClick={sendAnnounce}
                  className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gold hover:bg-gold/20 disabled:opacity-40"
                >
                  🎙 Announce
                </button>
              </div>
              <button
                type="button"
                disabled={freezing}
                onClick={toggleFreeze}
                className={cn(
                  "mt-4 w-full rounded-lg border px-3 py-2.5 text-sm font-semibold uppercase tracking-wider transition disabled:opacity-50",
                  frozen
                    ? "border-green/40 bg-green/10 text-green hover:bg-green/20"
                    : "border-red-500/50 bg-red-950/40 text-red-200 hover:bg-red-900/50",
                )}
              >
                {freezing ? "Working…" : frozen ? "▶ Resume all tables" : "⚡ Emergency freeze all"}
              </button>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PreviewTile title="Manual pot re-allocation" caption="Award/split a pot after a bad disconnect — dispute tooling, not wired." />
                <PreviewTile title="+60s shot-clock extension" caption="Grant time to a specific seat mid-hand — not wired." />
                <PreviewTile title="Inspect hole cards" caption="View live hole cards for dispute review — held for integrity." />
              </div>
            </NeonSection>
          </div>
        </div>
      </div>
    </div>
  );
}

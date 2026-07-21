"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface Tournament {
  id: string;
  name: string;
  variant: string;
  buy_in_minor: number;
  starting_stack: number;
  max_players: number;
  status: string;
  scheduled_at: string;
}

interface BlindLevel {
  id?: string;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_secs: number;
  is_break?: boolean;
}

interface Prize {
  rank_from: number;
  rank_to: number;
  payout_bps: number;
  guaranteed_minor: number;
}

function fmtClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function rankLabel(p: Prize): string {
  return p.rank_from === p.rank_to ? `#${p.rank_from}` : `#${p.rank_from}–${p.rank_to}`;
}

/** Live blind clock: walks the structure from scheduled_at while running. */
function useBlindClock(levels: BlindLevel[], status: string, scheduledAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (status !== "running" || levels.length === 0) return null;
  const start = Date.parse(scheduledAt);
  if (Number.isNaN(start)) return null;
  let elapsed = Math.max(0, Math.floor((now - start) / 1000));
  for (let i = 0; i < levels.length; i++) {
    const d = levels[i].duration_secs || 0;
    if (elapsed < d) return { level: levels[i], index: i, remaining: d - elapsed, done: false };
    elapsed -= d;
  }
  return { level: levels[levels.length - 1], index: levels.length - 1, remaining: 0, done: true };
}

function BlindClock({ levels, tournament }: { levels: BlindLevel[]; tournament: Tournament }) {
  const clock = useBlindClock(levels, tournament.status, tournament.scheduled_at);
  if (!clock) return null;
  const next = levels[clock.index + 1];
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-950/30 to-black/40 p-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
        {clock.level.is_break ? "Break" : `Level ${clock.level.level}`}
      </p>
      <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-amber-100">
        {clock.done ? "—" : fmtClock(clock.remaining)}
      </p>
      {!clock.level.is_break && (
        <p className="mt-2 text-sm text-neutral-300">
          Blinds{" "}
          <span className="font-semibold text-white">
            {clock.level.small_blind.toLocaleString()}/{clock.level.big_blind.toLocaleString()}
          </span>
          {clock.level.ante > 0 && <span className="text-neutral-400"> · ante {clock.level.ante.toLocaleString()}</span>}
        </p>
      )}
      {next && (
        <p className="mt-1 text-[11px] text-neutral-500">
          Next: {next.is_break ? "Break" : `${next.small_blind.toLocaleString()}/${next.big_blind.toLocaleString()}`}
        </p>
      )}
    </div>
  );
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blinds, setBlinds] = useState<BlindLevel[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadTournaments = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = (await callSessionRpc("tournament_list", {})) as { tournaments?: Tournament[] };
      setTournaments(data.tournaments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tournaments");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  const selectTournament = useCallback(async (id: string) => {
    setSelectedId(id);
    setMessage(null);
    try {
      const [b, p] = await Promise.all([
        callSessionRpc("blind_level_list", { tournament_id: id }),
        callSessionRpc("prize_pool_list", { tournament_id: id }),
      ]);
      setBlinds((b as { levels?: BlindLevel[] }).levels ?? []);
      setPrizes((p as { prizes?: Prize[] }).prizes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tournament details");
    }
  }, []);

  const startTournament = useCallback(async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = (await callSessionRpc("tournament_start", { tournament_id: id })) as {
        table_match_ids?: string[];
        director_match_id?: string;
      };
      setMessage(
        `Tournament started! ${result.table_match_ids?.length ?? 0} tables · director ${result.director_match_id ?? ""}`,
      );
      await loadTournaments();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }, [loadTournaments]);

  const register = useCallback(async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await callSessionRpc("tournament_register", { tournament_id: id });
      setMessage("Registered successfully!");
      await loadTournaments();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }, [loadTournaments]);

  const selectedTournament = tournaments.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300/80">Tournaments</p>
            <h1 className="mt-1 text-3xl font-semibold">MTT Lobby</h1>
          </div>
          <Link href="/hub" className="text-sm text-emerald-400 hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200">{error}</div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-200">
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Open Tournaments</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadTournaments()}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/5"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {tournaments.length === 0 && (
              <p className="text-sm text-neutral-500">
                No tournaments scheduled. Create one from the Command Center.
              </p>
            )}
            {tournaments.map((t) => (
              <div
                key={t.id}
                className={`rounded-xl border p-4 transition ${
                  selectedId === t.id
                    ? "border-violet-500/40 bg-violet-950/20"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => void selectTournament(t.id)} className="text-left">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-neutral-500">
                      Buy-in ${(t.buy_in_minor / 100).toFixed(2)} · Stack{" "}
                      {t.starting_stack.toLocaleString()} · {t.status}
                    </p>
                  </button>
                  <div className="flex gap-2">
                  {t.status === "registering" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void register(t.id)}
                        className="rounded-full bg-violet-700 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-violet-600 disabled:opacity-50"
                      >
                        Register
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void startTournament(t.id)}
                        className="rounded-full border border-emerald-400/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                      >
                        Start MTT
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {selectedTournament && (
          <section className="space-y-6">
            <BlindClock levels={blinds} tournament={selectedTournament} />

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
                <h3 className="font-semibold">Blind Structure</h3>
                {blinds.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-500">No blind levels defined yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-neutral-500">
                          <th className="py-1 text-left font-medium">Lvl</th>
                          <th className="py-1 text-right font-medium">Small</th>
                          <th className="py-1 text-right font-medium">Big</th>
                          <th className="py-1 text-right font-medium">Ante</th>
                          <th className="py-1 text-right font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blinds.map((lvl) => (
                          <tr
                            key={lvl.id ?? lvl.level}
                            className={`border-t border-white/5 ${lvl.is_break ? "text-amber-300" : "text-neutral-200"}`}
                          >
                            <td className="py-1.5 font-semibold">{lvl.is_break ? "☕" : lvl.level}</td>
                            {lvl.is_break ? (
                              <td colSpan={3} className="py-1.5 text-center italic text-amber-300/80">
                                Break
                              </td>
                            ) : (
                              <>
                                <td className="py-1.5 text-right tabular-nums">{lvl.small_blind.toLocaleString()}</td>
                                <td className="py-1.5 text-right tabular-nums">{lvl.big_blind.toLocaleString()}</td>
                                <td className="py-1.5 text-right tabular-nums text-neutral-400">
                                  {lvl.ante > 0 ? lvl.ante.toLocaleString() : "—"}
                                </td>
                              </>
                            )}
                            <td className="py-1.5 text-right tabular-nums text-neutral-400">
                              {fmtClock(lvl.duration_secs)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
                <h3 className="font-semibold">Prize Ladder</h3>
                {prizes.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-500">No prize structure defined yet.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {prizes
                      .slice()
                      .sort((a, b) => a.rank_from - b.rank_from)
                      .map((p, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                        >
                          <span className="flex items-center gap-2 font-semibold">
                            {p.rank_from === 1 && <span className="text-amber-300">🏆</span>}
                            {rankLabel(p)}
                          </span>
                          <span className="text-right">
                            <span className="font-semibold text-emerald-300">
                              {(p.payout_bps / 100).toFixed(1)}%
                            </span>
                            {p.guaranteed_minor > 0 && (
                              <span className="ml-2 text-[11px] text-neutral-500">
                                min ${(p.guaranteed_minor / 100).toLocaleString()}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

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

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blinds, setBlinds] = useState<unknown[]>([]);
  const [prizes, setPrizes] = useState<unknown[]>([]);
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
      setBlinds((b as { levels?: unknown[] }).levels ?? []);
      setPrizes((p as { prizes?: unknown[] }).prizes ?? []);
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300/80">Tournaments</p>
            <h1 className="mt-1 text-3xl font-semibold">MTT Lobby</h1>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
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

        {selectedId && (
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <h3 className="font-semibold">Blind Structure</h3>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-emerald-200">
                {JSON.stringify(blinds, null, 2)}
              </pre>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <h3 className="font-semibold">Prize Pool</h3>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-emerald-200">
                {JSON.stringify(prizes, null, 2)}
              </pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

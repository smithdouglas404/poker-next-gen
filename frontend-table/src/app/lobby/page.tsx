"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { GameProvider, formatCents, useGame } from "@/features/game/GameProvider";
import { BuyInSlider } from "@/features/hud/TableLog";
import { TableCard } from "@/features/hud/TableCard";

function LobbyContent() {
  const { listTables, openTables, joinRoom, joinByCode, createRoom, findMatch, matchmakerSearching, connected, buyInCents } =
    useGame();
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) void listTables();
  }, [connected, listTables]);

  // Deep-link join: /lobby?code=XXXXXX (shared invite link).
  useEffect(() => {
    if (!connected) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void (async () => {
      try {
        await joinByCode(code);
        window.location.href = "/table";
      } catch (e) {
        setCodeError(e instanceof Error ? e.message : "That room code didn't work");
      }
    })();
  }, [connected, joinByCode]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Cash Games</p>
            <h1 className="mt-1 text-3xl font-semibold">Table Lobby</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Browse open 6-max tables · buy-in {formatCents(buyInCents)} · Nakama realtime
            </p>
          </div>
          <Link href="/table" className="text-sm text-emerald-400 hover:underline">
            Open Table →
          </Link>
          <Link href="/hub" className="text-sm text-neutral-400 hover:underline">
            Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        {codeError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {codeError}
          </div>
        )}
        <BuyInSlider />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => createRoom())}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-50"
          >
            Create Table
          </button>
          <button
            type="button"
            disabled={busy || matchmakerSearching}
            onClick={() => run(() => findMatch())}
            className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-sky-200 disabled:opacity-50"
          >
            {matchmakerSearching ? "Searching…" : "Quick Match"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => listTables())}
            className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Open Tables</h2>
          <p className="mt-1 text-sm text-neutral-500">
            OddSlingers-style lobby · powered by Nakama match list
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openTables.length === 0 && (
              <p className="col-span-full text-sm text-neutral-500">
                No tables yet — create one or use Quick Match.
              </p>
            )}
            {openTables.map((t) => (
              <TableCard
                key={t.match_id}
                table={t}
                buyInLabel={formatCents(buyInCents)}
                busy={busy}
                onJoin={() =>
                  run(async () => {
                    await joinRoom(t.match_id);
                    window.location.href = "/table";
                  })
                }
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <GameProvider>
      <LobbyContent />
    </GameProvider>
  );
}

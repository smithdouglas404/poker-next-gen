"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { GameProvider, formatCents, useGame } from "@/features/game/GameProvider";
import { BuyInSlider } from "@/features/hud/TableLog";

function LobbyContent() {
  const { listTables, openTables, joinRoom, createRoom, findMatch, matchmakerSearching, connected, buyInCents } =
    useGame();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (connected) void listTables();
  }, [connected, listTables]);

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
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
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

        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold">Open Tables</h2>
          <div className="mt-4 space-y-2">
            {openTables.length === 0 && (
              <p className="text-sm text-neutral-500">No tables yet — create one or use Quick Match.</p>
            )}
            {openTables.map((t) => (
              <div
                key={t.match_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div>
                  <p className="font-medium">{t.room_id ?? t.label ?? "Hold'em Table"}</p>
                  <p className="font-mono text-[10px] text-neutral-500">{t.match_id}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await joinRoom(t.match_id);
                    window.location.href = "/table";
                  })}
                  className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-emerald-600"
                >
                  Join
                </button>
              </div>
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

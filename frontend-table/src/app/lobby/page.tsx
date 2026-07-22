"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GameProvider, formatCents, useGame } from "@/features/game/GameProvider";
import { MAX_BUY_IN_CENTS, MIN_BUY_IN_CENTS } from "@/features/game/protocol";
import { GameModeModal } from "@/features/lobby/GameModeModal";
import { LobbyTableCard } from "@/features/lobby/LobbyTableCard";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

function LobbyContent() {
  const router = useRouter();
  const {
    listTables,
    openTables,
    joinRoom,
    joinByCode,
    findMatch,
    matchmakerSearching,
    matchId,
    connected,
    buyInCents,
    setBuyInCents,
    profile,
  } = useGame();

  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) void listTables();
  }, [connected, listTables]);

  // Any successful join/create sets matchId — route straight to the table.
  useEffect(() => {
    if (matchId) router.push("/table");
  }, [matchId, router]);

  // Deep-link join: /lobby?code=XXXXXX (shared invite link) → room_resolve.
  useEffect(() => {
    if (!connected) return;
    const deep = new URLSearchParams(window.location.search).get("code");
    if (!deep) return;
    void joinByCode(deep).catch((e) =>
      setCodeError(e instanceof Error ? e.message : "That room code didn't work"),
    );
  }, [connected, joinByCode]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const submitCode = useCallback(() => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setCodeError(null);
    void run(async () => {
      try {
        await joinByCode(trimmed);
      } catch (e) {
        setCodeError(e instanceof Error ? e.message : "No table found for that code");
      }
    });
  }, [code, joinByCode, run]);

  const buyInDollars = Math.round(buyInCents / 100);

  return (
    <div className="relative min-h-screen text-foreground">
      {/* ambient bokeh (decorative, restrained) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 80% -5%, rgba(212,175,55,0.06), transparent), radial-gradient(50% 40% at 15% 0%, rgba(129,236,255,0.06), transparent)",
        }}
      />

      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className={HEADING_SM}>High Rollers Club</p>
            <h1 className="mt-1 bg-gradient-to-r from-[#f3e2ad] via-[#d4af37] to-[#9a7b2c] bg-clip-text font-display text-4xl font-bold uppercase tracking-wide text-transparent">
              Table Lobby
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Cash games, club sponsorships &amp; tournaments — Nakama realtime.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(GLASS_PANEL, "px-4 py-2")}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Wallet</p>
              <p className="font-display text-lg font-bold text-gold">
                {formatCents(profile.walletCents)}
              </p>
            </div>
            <Link
              href="/hub"
              className="text-sm text-cyan transition hover:text-cyan/80 hover:underline"
            >
              Command Center →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {codeError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {codeError}
          </div>
        )}

        {/* connection state */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-cyan shadow-[0_0_10px_rgba(129,236,255,0.6)]" : "bg-neutral-600",
            )}
          />
          <span className="uppercase tracking-[0.2em] text-neutral-500">
            {connected ? "Connected" : "Connecting…"}
          </span>
        </div>

        {/* primary actions */}
        <section className="grid gap-4 lg:grid-cols-3">
          {/* New Game (gold CTA) */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={cn(
              GLASS_PANEL,
              "group relative flex flex-col justify-between overflow-hidden p-6 text-left transition hover:border-gold/40 hover:shadow-[0_0_28px_rgba(212,175,55,0.15)]",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-2xl transition group-hover:opacity-70"
              style={{ background: "radial-gradient(closest-side, rgba(212,175,55,0.4), transparent)" }}
            />
            <div className="relative">
              <p className={HEADING_SM}>Start Playing</p>
              <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                New Game
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                Private table, club-sponsored public game, or tournament.
              </p>
            </div>
            <span
              className={cn(
                BTN_GOLD,
                "relative mt-6 inline-flex w-fit rounded-xl px-5 py-2.5 text-sm uppercase tracking-wide",
              )}
            >
              Choose Game Mode →
            </span>
          </button>

          {/* Quick Match (cyan) */}
          <button
            type="button"
            disabled={busy || matchmakerSearching || !connected}
            onClick={() => void run(() => findMatch())}
            className={cn(
              GLASS_PANEL,
              "flex flex-col justify-between p-6 text-left transition hover:border-cyan/40 hover:shadow-[0_0_28px_rgba(129,236,255,0.12)] disabled:opacity-50",
            )}
          >
            <div>
              <p className={HEADING_SM}>Matchmaker</p>
              <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                Quick Match
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                Get seated instantly at the next open cash game near your buy-in.
              </p>
            </div>
            <span className="mt-6 inline-flex w-fit rounded-xl border border-cyan/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-cyan">
              {matchmakerSearching ? "Searching…" : "Find a Seat →"}
            </span>
          </button>

          {/* Join by code */}
          <div className={cn(GLASS_PANEL, "flex flex-col justify-between p-6")}>
            <div>
              <p className={HEADING_SM}>Private Invite</p>
              <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                Join by Code
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                Enter a 6-character room code from a friend&apos;s invite.
              </p>
            </div>
            <div className="mt-6 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
                maxLength={8}
                placeholder="ABC123"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan/40 focus:ring-2 focus:ring-cyan/10"
              />
              <button
                type="button"
                disabled={busy || !code.trim()}
                onClick={submitCode}
                className="shrink-0 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/5 disabled:opacity-40"
              >
                Join
              </button>
            </div>
          </div>
        </section>

        {/* default buy-in */}
        <section className={cn(GLASS_PANEL, "p-5")}>
          <div className="flex items-center justify-between">
            <p className={HEADING_SM}>Default Buy-in</p>
            <p className="font-display text-lg font-bold text-gold">{formatCents(buyInCents)}</p>
          </div>
          <input
            type="range"
            min={MIN_BUY_IN_CENTS / 100}
            max={MAX_BUY_IN_CENTS / 100}
            step={50}
            value={buyInDollars}
            onChange={(e) => setBuyInCents(Number(e.target.value) * 100)}
            className="mt-3 w-full accent-[#d4af37]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
            <span>{formatCents(MIN_BUY_IN_CENTS)}</span>
            <span>{formatCents(MAX_BUY_IN_CENTS)}</span>
          </div>
        </section>

        {/* open tables */}
        <section>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
                Open Tables
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Live 6-max cash games from the Nakama match list.
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !connected}
              onClick={() => void run(() => listTables())}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openTables.length === 0 && (
              <div
                className={cn(
                  GLASS_PANEL,
                  "col-span-full flex flex-col items-center gap-3 p-10 text-center",
                )}
              >
                <p className="text-sm text-neutral-400">
                  No open tables yet — start a new game or find a quick match.
                </p>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className={cn(BTN_GOLD, "rounded-xl px-5 py-2.5 text-sm uppercase tracking-wide")}
                >
                  New Game
                </button>
              </div>
            )}
            {openTables.map((t) => (
              <LobbyTableCard
                key={t.match_id}
                table={t}
                buyInLabel={formatCents(buyInCents)}
                busy={busy}
                onJoin={() => void run(() => joinRoom(t.match_id))}
              />
            ))}
          </div>
        </section>
      </main>

      <GameModeModal open={modalOpen} onClose={() => setModalOpen(false)} />
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

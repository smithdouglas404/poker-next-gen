"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GameProvider, formatCents, useGame } from "@/features/game/GameProvider";
import { GameModeCards, type ModeCardDef } from "@/features/lobby/GameModeCards";
import { PrivateTableSetup } from "@/features/lobby/PrivateTableSetup";
import { PublicLobbyList } from "@/features/lobby/PublicLobbyList";
import {
  DEMO_CLUBS,
  DEMO_TOURNAMENTS,
  normalizeTournaments,
  type ClubLite,
  type LobbyView,
  type MeRoles,
  type TournamentLite,
} from "@/features/lobby/lobbyData";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
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
    profile,
  } = useGame();

  const [view, setView] = useState<LobbyView>("select");
  const [busy, setBusy] = useState(false);

  // roles + clubs (public-game gate), tournaments (teaser), demo flags
  const [roles, setRoles] = useState<MeRoles | null>(null);
  const [clubs, setClubs] = useState<ClubLite[]>([]);
  const [tournaments, setTournaments] = useState<TournamentLite[]>([]);
  const [tourneyDemo, setTourneyDemo] = useState(false);

  // join-by-code + search
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (connected) void listTables();
  }, [connected, listTables]);

  // Route to the table as soon as any join/create sets a match id.
  useEffect(() => {
    if (matchId) router.push("/table");
  }, [matchId, router]);

  // Deep-link join: /lobby?code=XXXXXX
  useEffect(() => {
    if (!connected) return;
    const deep = new URLSearchParams(window.location.search).get("code");
    if (!deep) return;
    void joinByCode(deep).catch((e) =>
      setCodeError(e instanceof Error ? e.message : "That room code didn't work"),
    );
  }, [connected, joinByCode]);

  // Load roles + clubs (public-game gate) once.
  useEffect(() => {
    void (async () => {
      try {
        const [r, c] = await Promise.all([
          callSessionRpc("me_roles", {}) as Promise<MeRoles>,
          callSessionRpc("club_list", {}) as Promise<{ clubs?: ClubLite[] }>,
        ]);
        setRoles(r ?? {});
        setClubs(c?.clubs ?? []);
      } catch {
        // Guest / offline: a guest is genuinely not a club owner — the correct
        // real state is "locked". Demo clubs only surface once sponsorship is
        // unlocked, never to fake ownership.
        setRoles({});
        setClubs([]);
      }
    })();
  }, []);

  // Tournament teaser (tournament_list) with demo fallback.
  useEffect(() => {
    void (async () => {
      try {
        const data = await callSessionRpc("tournament_list", {});
        const list = normalizeTournaments(data);
        if (list.length > 0) {
          setTournaments(list);
          setTourneyDemo(false);
        } else {
          setTournaments(DEMO_TOURNAMENTS);
          setTourneyDemo(true);
        }
      } catch {
        setTournaments(DEMO_TOURNAMENTS);
        setTourneyDemo(true);
      }
    })();
  }, []);

  const ownedClubs = useMemo(() => {
    const ids = new Set(roles?.club_admin_of ?? []);
    const owned = clubs.filter((c) => ids.has(c.id));
    if (owned.length === 0 && roles?.platform_admin) {
      return clubs.length > 0 ? clubs : DEMO_CLUBS;
    }
    return owned;
  }, [roles, clubs]);

  const canSponsor = (roles?.platform_admin ?? false) || ownedClubs.length > 0;

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

  const cards = useMemo<ModeCardDef[]>(
    () => [
      {
        key: "private",
        title: "Private Table",
        blurb: "Exclusive access. Custom blinds, invite-only for elite play. Set your stakes and play with invited guests.",
        cta: "Create Private Table",
        accent: "red",
        scene: "lounge",
      },
      {
        key: "public",
        title: "Public Game",
        subtitle: "Club Owner Sponsored",
        blurb: "Sponsor a club-branded open table anyone can join. Community play with exciting stakes.",
        cta: canSponsor ? "Create Public Game" : "Create Public Game (Locked)",
        accent: "gold",
        scene: "casino",
        locked: !canSponsor,
        lockedHint: "Only Club Owners can sponsor Public Games",
      },
      {
        key: "tournament",
        title: "Tournament",
        blurb: "Compete against the best. Multi-table events, big prize pools. Climb the leaderboard to become a legend.",
        cta: "Join Tournament",
        accent: "green",
        scene: "arena",
      },
    ],
    [canSponsor],
  );

  const onSelectMode = useCallback((key: ModeCardDef["key"]) => {
    setView(key);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="relative min-h-screen text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "#0b0d0f" }}
      />

      {/* ---- top bar ---- */}
      <header className="border-b border-white/[0.06] px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link
            href="/hub"
            className={cn(
              GLASS_PANEL,
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-white/20 hover:text-white",
            )}
          >
            <span aria-hidden>←</span> Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  connected ? "bg-green shadow-[0_0_10px_rgba(34,197,94,0.6)]" : "bg-neutral-600",
                )}
              />
              <span className="uppercase tracking-[0.2em] text-neutral-500">
                {connected ? "Connected" : "Guest"}
              </span>
            </div>
            <div className={cn(GLASS_PANEL, "px-4 py-2")}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Wallet</p>
              <p className="font-display text-lg font-bold text-gold">
                {formatCents(profile.walletCents)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {/* ---- hero title ---- */}
        <div>
          <p className={HEADING_SM}>High Rollers Club</p>
          <h1 className="mt-1 bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text font-display text-4xl font-bold uppercase tracking-wide text-transparent sm:text-5xl">
            {view === "private"
              ? "Private Table Setup"
              : view === "public"
                ? "Public Game Setup"
                : view === "tournament"
                  ? "Tournaments"
                  : "Game Mode Selection"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            {view === "select"
              ? "Choose how you want to play tonight — host a private table, sponsor a public club game, or enter a tournament."
              : view === "private"
                ? "Configure every detail of your table, then deal in your invited guests."
                : view === "public"
                  ? "Sponsor a club-branded open game for the community."
                  : "Multi-table events with escalating blinds and real prize pools."}
          </p>
        </div>

        {codeError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {codeError}
          </div>
        )}

        {/* ---- mode selection view ---- */}
        {view === "select" && (
          <>
            <GameModeCards cards={cards} onSelect={onSelectMode} />

            {/* quick-play strip: matchmaker + join-by-code */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className={cn(GLASS_PANEL, "flex flex-col justify-between p-5")}>
                <div>
                  <p className={HEADING_SM}>Matchmaker</p>
                  <h2 className="mt-2 font-display text-xl font-bold uppercase tracking-wide text-foreground">
                    Quick Match
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Get seated instantly at the next open cash game near your buy-in.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || matchmakerSearching || !connected}
                  onClick={() => void run(() => findMatch())}
                  className="mt-4 inline-flex w-fit rounded-xl border border-brand/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-brand transition hover:bg-brand/5 disabled:opacity-40"
                >
                  {matchmakerSearching ? "Searching…" : "Find a Seat →"}
                </button>
              </div>

              <div className={cn(GLASS_PANEL, "flex flex-col justify-between p-5")}>
                <div>
                  <p className={HEADING_SM}>Private Invite</p>
                  <h2 className="mt-2 font-display text-xl font-bold uppercase tracking-wide text-foreground">
                    Join by Code
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Enter a 6-character room code from a friend&apos;s invite link.
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()}
                    maxLength={8}
                    placeholder="ABC123"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25 focus:ring-2 focus:ring-white/10"
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

            {/* ---- public lobby list ---- */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                    Public Lobby
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Live open tables from the Nakama match list.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search tables…"
                    className="w-44 rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25 focus:ring-2 focus:ring-white/10"
                  />
                  <button
                    type="button"
                    disabled={busy || !connected}
                    onClick={() => void run(() => listTables())}
                    className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <PublicLobbyList
                  liveTables={openTables}
                  connected={connected}
                  busy={busy}
                  query={query}
                  onJoin={(id) => void run(() => joinRoom(id))}
                />
              </div>
            </section>
          </>
        )}

        {/* ---- private / public setup ---- */}
        {(view === "private" || view === "public") && (
          <>
            {view === "public" && !canSponsor ? (
              <div className={cn(GLASS_PANEL, "space-y-4 border-gold/25 bg-gold/[0.04] p-6")}>
                <p className={cn(HEADING_SM, "text-gold")}>Public Games — Club Owners Only</p>
                <p className="text-sm text-gold/80">
                  Public games are sponsored by clubs. You need an owner or operator role in a club
                  to host one (checked via <span className="font-mono">me_roles</span>). Start or join
                  a club, then return here.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/clubs"
                    className={cn(BTN_GOLD, "rounded-xl px-5 py-2.5 text-sm uppercase tracking-wide")}
                  >
                    Manage Clubs →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setView("select")}
                    className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/5"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            ) : (
              <PrivateTableSetup
                mode={view}
                sponsorClubs={view === "public" ? ownedClubs : undefined}
                onBack={() => setView("select")}
              />
            )}
          </>
        )}

        {/* ---- tournament teaser ---- */}
        {view === "tournament" && (
          <section className="space-y-5">
            {tourneyDemo && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3 text-[11px] text-amber-200/80">
                Demo tournaments shown — no live events returned from the server yet.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tournaments.map((t) => (
                <article key={t.id} className={cn(GLASS_PANEL, "flex flex-col p-5")}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
                      {t.name}
                    </h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        t.status === "running"
                          ? "bg-green/15 text-green"
                          : t.status === "finished"
                            ? "bg-white/5 text-neutral-400"
                            : "bg-gold/15 text-gold",
                      )}
                    >
                      {t.status ?? "registering"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-500">
                    {(t.variant ?? "texas-holdem").replace(/-/g, " ")}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Stat k="Buy-in" v={t.buy_in_minor ? formatCents(t.buy_in_minor) : "Freeroll"} />
                    <Stat
                      k="Prize Pool"
                      v={t.prize_pool_minor ? formatCents(t.prize_pool_minor) : "—"}
                      accent
                    />
                    <Stat k="Stack" v={(t.starting_stack ?? 0).toLocaleString()} />
                    <Stat
                      k="Players"
                      v={`${t.registered ?? 0}/${t.max_players ?? 0}`}
                    />
                  </dl>
                  <Link
                    href="/tournaments"
                    className={cn(
                      BTN_GOLD,
                      "mt-5 rounded-xl px-5 py-2.5 text-center text-sm uppercase tracking-wide",
                    )}
                  >
                    View &amp; Register →
                  </Link>
                </article>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setView("select")}
              className="text-xs uppercase tracking-[0.2em] text-neutral-500 transition hover:text-foreground"
            >
              ← Back to game modes
            </button>
          </section>
        )}

        {/* ---- footer ---- */}
        <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-white/[0.06] pt-6 text-xs text-neutral-500">
          <Link href="/hub" className="transition hover:text-foreground">About Us</Link>
          <Link href="/hub" className="transition hover:text-foreground">Terms</Link>
          <Link href="/hub" className="transition hover:text-foreground">Privacy</Link>
        </footer>
      </main>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{k}</dt>
      <dd className={cn("mt-0.5 font-display text-sm font-bold", accent ? "text-gold" : "text-foreground")}>
        {v}
      </dd>
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

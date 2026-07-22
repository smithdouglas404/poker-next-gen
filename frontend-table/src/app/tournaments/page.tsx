"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/features/ui/tokens";
import {
  blindLevels,
  createTournament,
  leaderboardTop,
  listTournaments,
  prizePool,
  registerTournament,
  tournamentAnalytics,
  tournamentStatus,
} from "@/features/tournaments/api";
import {
  DEMO_BLINDS,
  DEMO_LEADERBOARD,
  DEMO_REGISTERED,
  DEMO_TOURNAMENTS,
  demoAnalytics,
} from "@/features/tournaments/demo";
import { CreateTournamentPanel } from "@/features/tournaments/CreateTournamentPanel";
import { Lobby } from "@/features/tournaments/Lobby";
import { OwnerCenter } from "@/features/tournaments/OwnerCenter";
import type {
  BlindLevel,
  DraftForm,
  EnrichedTournament,
  LeaderEntry,
  LobbyMeta,
  TopTab,
  Tournament,
  TournamentAnalytics,
} from "@/features/tournaments/types";

/** Heuristic UI enrichment for live rows (the backend has no cosmetic tags). */
function enrich(t: Tournament, index: number): EnrichedTournament {
  const buyIn = t.buy_in_minor / 100;
  let tag = "EVENT";
  let tagTone: LobbyMeta["tagTone"] = "cyan";
  let speed = "Regular";
  if (buyIn >= 10_000) {
    tag = "HIGH ROLLER";
    tagTone = "gold";
    speed = "Deep Stack";
  } else if (buyIn >= 1_000) {
    tag = "MAJOR";
    tagTone = "green";
    speed = "Regular";
  } else if (t.starting_stack <= 15_000) {
    tag = "TURBO";
    tagTone = "cyan";
    speed = "Turbo";
  }
  const featured = index < 2 || buyIn >= 10_000;
  return {
    ...t,
    meta: {
      tag,
      tagTone,
      format: t.variant === "plo" ? "PLO 4-Card" : "NL Hold'em",
      speed,
      featured,
      lateReg: t.status === "running",
      heroArt: featured
        ? tagTone === "gold"
          ? "radial-gradient(120% 120% at 80% 10%, rgba(212,175,55,0.20), transparent 55%), linear-gradient(135deg,#111318,#05070c)"
          : "radial-gradient(120% 120% at 20% 10%, rgba(129,236,255,0.18), transparent 55%), linear-gradient(135deg,#0a1418,#05070c)"
        : undefined,
    },
  };
}

type FocusState = {
  leaders: LeaderEntry[];
  levels: BlindLevel[];
};

export default function TournamentsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TopTab>("lobby");
  const [tournaments, setTournaments] = useState<EnrichedTournament[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [registeredByMe, setRegisteredByMe] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusState>({ leaders: [], levels: [] });
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3400);
  }, []);

  const loadDemo = useCallback(() => {
    setDemo(true);
    setTournaments(DEMO_TOURNAMENTS);
    setCounts({ ...DEMO_REGISTERED });
    setSelectedId((prev) => prev ?? DEMO_TOURNAMENTS[0].id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const live = await listTournaments();
      if (live.length === 0) {
        loadDemo();
        return;
      }
      const enriched = live.map((t, i) => enrich(t, i));
      setDemo(false);
      setTournaments(enriched);
      setSelectedId((prev) => prev ?? enriched[0]?.id ?? null);
      // Registered counts drive prize pools — pull each event's live status.
      const results = await Promise.allSettled(enriched.map((t) => tournamentStatus(t.id)));
      const map: Record<string, number> = {};
      results.forEach((r, i) => {
        map[enriched[i].id] = r.status === "fulfilled" ? r.value.registered_count ?? 0 : 0;
      });
      setCounts(map);
    } catch {
      loadDemo();
    } finally {
      setLoading(false);
    }
  }, [loadDemo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load focus rail (leaderboard + blind structure) for the selected tournament.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    if (demo) {
      setFocus({ leaders: DEMO_LEADERBOARD, levels: DEMO_BLINDS });
      return;
    }
    (async () => {
      const [statusRes, levelsRes, boardRes] = await Promise.allSettled([
        tournamentStatus(selectedId),
        blindLevels(selectedId),
        leaderboardTop("chips", 5),
      ]);
      if (cancelled) return;
      const standings =
        statusRes.status === "fulfilled" ? statusRes.value.standings ?? [] : [];
      const board = boardRes.status === "fulfilled" ? boardRes.value : [];
      const levels = levelsRes.status === "fulfilled" ? levelsRes.value : [];
      setFocus({
        leaders: standings.length > 0 ? standings : board,
        levels: levels.length > 0 ? levels : DEMO_BLINDS,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, demo]);

  const onRegister = useCallback(
    async (id: string) => {
      const t = tournaments.find((x) => x.id === id);
      if (registeredByMe.has(id)) return;
      setBusy(true);
      try {
        if (demo) {
          setRegisteredByMe((s) => new Set(s).add(id));
          setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
          notify(`Demo: registered for ${t?.name ?? "event"} (offline showcase).`);
          return;
        }
        await registerTournament(id);
        setRegisteredByMe((s) => new Set(s).add(id));
        setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
        notify(`Registered for ${t?.name ?? "tournament"}.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Registration failed", "err");
      } finally {
        setBusy(false);
      }
    },
    [tournaments, registeredByMe, demo, notify],
  );

  const onWatch = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.push(`/table?spectate=${encodeURIComponent(id)}`);
    },
    [router],
  );

  const loadAnalytics = useCallback(
    async (id: string): Promise<TournamentAnalytics> => {
      if (demo) return demoAnalytics(id);
      try {
        const a = await tournamentAnalytics(id);
        // prize_pool_list is the canonical payout ladder — fill it in when the
        // analytics snapshot has not attached tiers yet.
        if (!a.prizes || a.prizes.length === 0) {
          try {
            a.prizes = await prizePool(id);
          } catch {
            /* leave ladder empty */
          }
        }
        return a;
      } catch {
        return demoAnalytics(id);
      }
    },
    [demo],
  );

  const onPublish = useCallback(
    async (draft: DraftForm) => {
      setBusy(true);
      try {
        if (demo) {
          notify(`Demo: "${draft.name}" would publish via tournament_create.`);
          setShowCreate(false);
          return;
        }
        await createTournament(draft);
        notify(`Published "${draft.name}".`);
        setShowCreate(false);
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Publish failed", "err");
      } finally {
        setBusy(false);
      }
    },
    [demo, notify, load],
  );

  const totalPrizeMinor = useMemo(
    () => tournaments.reduce((s, t) => s + (counts[t.id] ?? 0) * t.buy_in_minor, 0),
    [tournaments, counts],
  );

  return (
    <div className="min-h-screen text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/hub" className="font-display text-lg font-bold uppercase tracking-wider text-cyan">
              Neon Vault
            </Link>
            <nav className="flex items-center gap-1">
              {(["lobby", "center"] as TopTab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide transition",
                    tab === id ? "bg-white/10 text-white" : "text-neutral-400 hover:text-neutral-200",
                  )}
                >
                  {id === "lobby" ? "Lobby" : "Tournament Center"}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {demo && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                Demo · Offline
              </span>
            )}
            <Link href="/hub" className="text-sm text-cyan hover:underline">
              ← Command Center
            </Link>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 text-sm font-medium backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-950/40 text-emerald-200"
              : "border-red-400/30 bg-red-950/40 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm uppercase tracking-[0.2em] text-neutral-500">
            Loading tournaments…
          </div>
        ) : tab === "lobby" ? (
          <Lobby
            tournaments={tournaments}
            registeredCounts={counts}
            registeredByMe={registeredByMe}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRegister={onRegister}
            onWatch={onWatch}
            focusLeaders={focus.leaders}
            focusLevels={focus.levels}
            demo={demo}
            busy={busy}
            totalPrizeMinor={totalPrizeMinor}
          />
        ) : (
          <OwnerCenter
            tournaments={tournaments}
            registeredCounts={counts}
            loadAnalytics={loadAnalytics}
            onCreate={() => setShowCreate(true)}
            demo={demo}
          />
        )}
      </main>

      {showCreate && (
        <CreateTournamentPanel
          onClose={() => setShowCreate(false)}
          onPublish={onPublish}
          busy={busy}
        />
      )}
    </div>
  );
}

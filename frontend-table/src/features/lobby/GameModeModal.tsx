"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import {
  MAX_BUY_IN_CENTS,
  MAX_SEATS,
  MIN_BUY_IN_CENTS,
  MIN_SEATS,
} from "@/features/game/protocol";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Select } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

// ---- server response shapes ------------------------------------------------

interface MeRoles {
  platform_admin?: boolean;
  club_admin_of?: string[];
}

interface ClubLite {
  id: string;
  name: string;
  slug?: string;
}

interface Tournament {
  id: string;
  name: string;
  variant?: string;
  buy_in_minor?: number;
  starting_stack?: number;
  max_players?: number;
  status?: string;
  scheduled_at?: string;
}

type Mode = "select" | "private" | "public" | "tournament";

const BLIND_PRESETS: Array<{ label: string; sb: number; bb: number }> = [
  { label: "$1 / $2", sb: 100, bb: 200 },
  { label: "$2 / $5", sb: 200, bb: 500 },
  { label: "$5 / $10", sb: 500, bb: 1000 },
  { label: "$25 / $50", sb: 2500, bb: 5000 },
];

// ---------------------------------------------------------------------------

export function GameModeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createRoom, findMatch, matchmakerSearching } = useGame();

  const [mode, setMode] = useState<Mode>("select");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // sponsorship gating
  const [roles, setRoles] = useState<MeRoles | null>(null);
  const [clubs, setClubs] = useState<ClubLite[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  // tournaments
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tourneyLoaded, setTourneyLoaded] = useState(false);
  const [registered, setRegistered] = useState<Record<string, boolean>>({});

  // private / public form
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<"holdem" | "plo">("holdem");
  const [blindIdx, setBlindIdx] = useState(0);
  const [buyInDollars, setBuyInDollars] = useState(500);
  const [seats, setSeats] = useState(6);
  const [bots, setBots] = useState(0);
  const [durationMins, setDurationMins] = useState(0);
  const [sponsorClub, setSponsorClub] = useState("");

  const reset = useCallback(() => {
    setMode("select");
    setError(null);
    setNotice(null);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Load roles + clubs once the modal opens (drives sponsorship gating).
  useEffect(() => {
    if (!open || rolesLoaded) return;
    void (async () => {
      try {
        const [r, c] = await Promise.all([
          callSessionRpc("me_roles", {}) as Promise<MeRoles>,
          callSessionRpc("club_list", {}) as Promise<{ clubs?: ClubLite[] }>,
        ]);
        setRoles(r ?? {});
        setClubs(c.clubs ?? []);
      } catch {
        setRoles({});
        setClubs([]);
      } finally {
        setRolesLoaded(true);
      }
    })();
  }, [open, rolesLoaded]);

  // Clubs the caller may sponsor a public game for = clubs they administer.
  const ownedClubs = useMemo(() => {
    const ids = new Set(roles?.club_admin_of ?? []);
    const owned = clubs.filter((c) => ids.has(c.id));
    return owned;
  }, [roles, clubs]);

  const canSponsor = (roles?.platform_admin ?? false) || ownedClubs.length > 0;

  useEffect(() => {
    if (!sponsorClub && ownedClubs.length > 0) setSponsorClub(ownedClubs[0].id);
  }, [ownedClubs, sponsorClub]);

  const loadTournaments = useCallback(async () => {
    try {
      const data = (await callSessionRpc("tournament_list", {})) as { tournaments?: Tournament[] };
      setTournaments(data.tournaments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tournaments");
    } finally {
      setTourneyLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && mode === "tournament" && !tourneyLoaded) void loadTournaments();
  }, [open, mode, tourneyLoaded, loadTournaments]);

  // ---- actions (every one calls a real RPC) --------------------------------

  const launch = useCallback(
    async (kind: "private" | "public") => {
      setBusy(true);
      setError(null);
      const preset = BLIND_PRESETS[blindIdx];
      const clubName =
        kind === "public"
          ? ownedClubs.find((c) => c.id === sponsorClub)?.name ?? "Club"
          : undefined;
      const defaultName =
        kind === "public"
          ? `${clubName} Public Game`
          : variant === "plo"
            ? "PLO Table"
            : "Hold'em Table";
      try {
        // table_create (proxied through GameProvider.createRoom, which also
        // seats the host and opens the match socket).
        await createRoom({
          name: name.trim() || defaultName,
          smallBlind: preset.sb,
          bigBlind: preset.bb,
          buyIn: Math.round(buyInDollars * 100),
          maxSeats: kind === "public" ? Math.max(seats, 6) : seats,
          numBots: kind === "public" ? 0 : bots,
          variant,
          durationMins,
        });
        // createRoom joins the match → the lobby's matchId effect routes to /table.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the table");
        setBusy(false);
      }
    },
    [
      blindIdx,
      ownedClubs,
      sponsorClub,
      variant,
      name,
      buyInDollars,
      seats,
      bots,
      durationMins,
      createRoom,
    ],
  );

  const quickSeat = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await findMatch(); // matchmaker_enqueue + socket ticket
      setNotice("Searching the pool for an open seat…");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Matchmaker failed");
    } finally {
      setBusy(false);
    }
  }, [findMatch]);

  const register = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await callSessionRpc("tournament_register", { tournament_id: id });
        setRegistered((prev) => ({ ...prev, [id]: true }));
        setNotice("Registered. Your seat is reserved for the next event.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Registration failed");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

      <div
        className={cn(
          GLASS_PANEL,
          "relative z-10 my-8 w-full max-w-3xl border-white/10 p-6 sm:p-8",
          "shadow-[0_0_60px_rgba(0,0,0,0.6)]",
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={HEADING_SM}>
              {mode === "select" ? "New Game" : mode === "tournament" ? "Tournaments" : "Configure Table"}
            </p>
            <h2 className="mt-1 bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text font-display text-2xl font-bold uppercase tracking-wide text-transparent">
              {mode === "select"
                ? "Choose Your Game Mode"
                : mode === "private"
                  ? "Private Table"
                  : mode === "public"
                    ? "Public Game"
                    : "Live Tournaments"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-white/25 hover:text-white"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-xl border border-green/25 bg-green/5 p-3 text-sm text-green">
            {notice}
          </div>
        )}

        {/* ---- mode selection ---- */}
        {mode === "select" && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <ModeCard
              title="Private Table"
              accent="red"
              blurb="Host your own Hold'em or PLO table. Set blinds, buy-in, seats and bots — share the room code with friends."
              onClick={() => setMode("private")}
            />
            <ModeCard
              title="Public Game"
              accent="gold"
              locked={rolesLoaded && !canSponsor}
              lockedHint="Club owners only"
              blurb="Sponsor a club-branded open table anyone can join. Requires an operator role in a club."
              onClick={() => {
                if (!canSponsor) {
                  setMode("public"); // still show the gated explainer + real club data
                } else {
                  setMode("public");
                }
              }}
            />
            <ModeCard
              title="Tournament"
              accent="green"
              blurb="Register for scheduled multi-table tournaments with escalating blinds and prize pools."
              onClick={() => setMode("tournament")}
            />
          </div>
        )}

        {/* ---- private / public form ---- */}
        {(mode === "private" || mode === "public") && (
          <div className="mt-6 space-y-5">
            {mode === "public" && !canSponsor && (
              <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-4 text-sm text-gold">
                <p className="font-semibold">Public games are sponsored by clubs.</p>
                <p className="mt-1 text-gold/80">
                  You need an owner or operator role in a club to host one. Start or join a club, then
                  return here.
                </p>
                <a
                  href="/clubs"
                  className="mt-3 inline-block rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold transition hover:bg-gold/10"
                >
                  Manage Clubs →
                </a>
              </div>
            )}

            {mode === "public" && canSponsor && (
              <Field label="Sponsoring Club" hint="Only clubs you operate are listed (via me_roles).">
                <Select value={sponsorClub} onChange={(e) => setSponsorClub(e.target.value)}>
                  {ownedClubs.length === 0 && <option value="">No clubs available</option>}
                  {ownedClubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {(mode === "private" || canSponsor) && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Table Name">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={mode === "public" ? "Club Public Game" : "High Rollers Lounge"}
                    />
                  </Field>
                  <Field label="Variant">
                    <Select
                      value={variant}
                      onChange={(e) => setVariant(e.target.value === "plo" ? "plo" : "holdem")}
                    >
                      <option value="holdem">Texas Hold&apos;em</option>
                      <option value="plo">Pot-Limit Omaha</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Blinds">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BLIND_PRESETS.map((p, i) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setBlindIdx(i)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          i === blindIdx
                            ? "border-brand/50 bg-brand/10 text-brand"
                            : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={`Buy-in — ${formatCents(Math.round(buyInDollars * 100))}`}
                    hint={`Range ${formatCents(MIN_BUY_IN_CENTS)} – ${formatCents(MAX_BUY_IN_CENTS)}`}
                  >
                    <input
                      type="range"
                      min={MIN_BUY_IN_CENTS / 100}
                      max={MAX_BUY_IN_CENTS / 100}
                      step={50}
                      value={buyInDollars}
                      onChange={(e) => setBuyInDollars(Number(e.target.value))}
                      className="w-full accent-[#f5c518]"
                    />
                  </Field>
                  <Field label={`Seats — ${seats}`}>
                    <input
                      type="range"
                      min={MIN_SEATS}
                      max={MAX_SEATS}
                      step={1}
                      value={seats}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSeats(v);
                        if (bots > v - 1) setBots(v - 1);
                      }}
                      className="w-full accent-[#e01e2b]"
                    />
                  </Field>
                </div>

                {mode === "private" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Bots — ${bots}`} hint="Fill empty seats with AI opponents">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, seats - 1)}
                        step={1}
                        value={bots}
                        onChange={(e) => setBots(Number(e.target.value))}
                        className="w-full accent-[#e01e2b]"
                      />
                    </Field>
                    <Field label="Auto-close" hint="0 = table stays open indefinitely">
                      <Select
                        value={String(durationMins)}
                        onChange={(e) => setDurationMins(Number(e.target.value))}
                      >
                        <option value="0">No limit</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="180">3 hours</option>
                      </Select>
                    </Field>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={busy || (mode === "public" && !sponsorClub)}
                    onClick={() => void launch(mode)}
                    className={cn(
                      BTN_GOLD,
                      "flex-1 rounded-xl px-5 py-3 text-sm uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                  >
                    {busy
                      ? "Creating…"
                      : mode === "public"
                        ? "Launch Public Game"
                        : "Create Private Table"}
                  </button>
                  {mode === "private" && (
                    <Button
                      variant="outline"
                      size="lg"
                      disabled={busy || matchmakerSearching}
                      onClick={() => void quickSeat()}
                    >
                      {matchmakerSearching ? "Searching…" : "Quick Match"}
                    </Button>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("select");
                setError(null);
              }}
              className="text-xs uppercase tracking-[0.2em] text-neutral-500 transition hover:text-foreground"
            >
              ← Back to modes
            </button>
          </div>
        )}

        {/* ---- tournaments ---- */}
        {mode === "tournament" && (
          <div className="mt-6 space-y-4">
            {!tourneyLoaded && <p className="text-sm text-neutral-500">Loading tournaments…</p>}
            {tourneyLoaded && tournaments.length === 0 && (
              <div className={cn(GLASS_PANEL, "p-6 text-center text-sm text-neutral-400")}>
                No tournaments scheduled right now. Check back soon.
              </div>
            )}
            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    GLASS_PANEL,
                    "flex flex-wrap items-center justify-between gap-3 p-4",
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
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
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {(t.variant ?? "texas-holdem").replace("-", " ")} ·{" "}
                      {t.buy_in_minor ? `${formatCents(t.buy_in_minor)} buy-in` : "Freeroll"} ·{" "}
                      {(t.starting_stack ?? 0).toLocaleString()} stack · up to {t.max_players ?? 0}{" "}
                      players
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || registered[t.id] || t.status === "finished"}
                    onClick={() => void register(t.id)}
                    className={cn(
                      "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-40",
                      registered[t.id]
                        ? "border border-green/40 text-green"
                        : "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] hover:shadow-[0_6px_18px_-6px_rgba(245,197,24,0.4)] hover:-translate-y-px",
                    )}
                  >
                    {registered[t.id] ? "Registered" : "Register"}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMode("select")}
              className="text-xs uppercase tracking-[0.2em] text-neutral-500 transition hover:text-foreground"
            >
              ← Back to modes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeCard({
  title,
  blurb,
  onClick,
  accent,
  locked,
  lockedHint,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
  accent: "red" | "gold" | "green";
  locked?: boolean;
  lockedHint?: string;
}) {
  const ring =
    accent === "gold"
      ? "hover:border-gold/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
      : accent === "green"
        ? "hover:border-green/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
        : "hover:border-brand/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]";
  const dot =
    accent === "gold" ? "bg-gold" : accent === "green" ? "bg-green" : "bg-brand";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        GLASS_PANEL,
        "group relative flex h-full flex-col p-5 text-left transition",
        ring,
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          {title}
        </span>
        {locked && (
          <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
            {lockedHint ?? "Locked"}
          </span>
        )}
      </span>
      <span className="mt-3 text-xs leading-relaxed text-neutral-400">{blurb}</span>
      <span className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500 transition group-hover:text-foreground">
        Select →
      </span>
    </button>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import {
  MAX_BUY_IN_CENTS,
  MAX_SEATS,
  MIN_BUY_IN_CENTS,
  MIN_SEATS,
} from "@/features/game/protocol";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Field, Input } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import {
  BLIND_PRESETS,
  DURATION_OPTIONS,
  demoRoomCode,
  type ClubLite,
} from "./lobbyData";

// A rich private-table (also club public-game) setup form synthesized from the
// HRC "detailed private table setup" masters: blinds, buy-in, seats 2-9, variant,
// duration, table-feature toggles (bomb pot / straddle / run-it-twice),
// invite-only + room code, spectators and bots. The Create button calls the real
// `table_create` RPC with the full config, then joins the match; offline (guest
// with no backend) it renders a clearly-labeled demo confirmation.

type Variant = "holdem" | "plo";

interface CreatedTable {
  match_id?: string;
  room_id?: string;
  code?: string;
  demo?: boolean;
}

const FEATURE_TOGGLES: Array<{ key: FeatureKey; label: string; blurb: string }> = [
  { key: "bombPot", label: "Bomb Pots", blurb: "Periodic all-ante flops — everyone sees a flop, no preflop betting." },
  { key: "straddle", label: "Straddle", blurb: "Allow a live blind raise from under-the-gun before cards are dealt." },
  { key: "runItTwice", label: "Run It Twice", blurb: "All-in players may run the remaining board twice to cut variance." },
  { key: "ante", label: "Antes", blurb: "Every player posts a small ante each hand to build the pot." },
];

type FeatureKey = "bombPot" | "straddle" | "runItTwice" | "ante";

export function PrivateTableSetup({
  mode,
  sponsorClubs,
  onBack,
}: {
  mode: "private" | "public";
  sponsorClubs?: ClubLite[];
  onBack: () => void;
}) {
  const { connected, joinRoom, findMatch, matchmakerSearching, profile } = useGame();

  const isPublic = mode === "public";

  const [name, setName] = useState("");
  const [variant, setVariant] = useState<Variant>("holdem");
  const [blindIdx, setBlindIdx] = useState(1);
  const [customBlinds, setCustomBlinds] = useState(false);
  const [sbDollars, setSbDollars] = useState(1);
  const [bbDollars, setBbDollars] = useState(2);
  const [buyInDollars, setBuyInDollars] = useState(500);
  const [seats, setSeats] = useState(6);
  const [bots, setBots] = useState(0);
  const [durationMins, setDurationMins] = useState(0);
  const [inviteOnly, setInviteOnly] = useState(!isPublic);
  const [spectators, setSpectators] = useState(true);
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    bombPot: false,
    straddle: false,
    runItTwice: true,
    ante: false,
  });
  const [sponsorClub, setSponsorClub] = useState(sponsorClubs?.[0]?.id ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTable | null>(null);

  const blinds = useMemo(() => {
    if (customBlinds) {
      const sb = Math.max(1, Math.round(sbDollars * 100));
      const bb = Math.max(sb, Math.round(bbDollars * 100));
      return { sb, bb };
    }
    const preset = BLIND_PRESETS[blindIdx];
    return { sb: preset.sb, bb: preset.bb };
  }, [customBlinds, sbDollars, bbDollars, blindIdx]);

  const toggleFeature = useCallback((key: FeatureKey) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCreated(null);

    const clubName = sponsorClubs?.find((c) => c.id === sponsorClub)?.name ?? "Club";
    const fallbackName = isPublic
      ? `${clubName} Public Game`
      : variant === "plo"
        ? "PLO Table"
        : "Hold'em Table";

    const payload = {
      name: name.trim() || fallbackName,
      small_blind: blinds.sb,
      big_blind: blinds.bb,
      buy_in: Math.round(buyInDollars * 100),
      max_seats: seats,
      num_bots: isPublic ? 0 : bots,
      variant,
      duration_mins: durationMins,
      // Extended table configuration — sent with the create RPC. Unknown fields
      // are ignored server-side today; this keeps the wiring honest (the exact
      // config the host chose is what gets transmitted).
      invite_only: inviteOnly,
      allow_spectators: spectators,
      bomb_pot: features.bombPot,
      straddle: features.straddle,
      run_it_twice: features.runItTwice,
      ante: features.ante,
      public: isPublic,
      sponsor_club_id: isPublic ? sponsorClub : undefined,
    };

    try {
      const res = (await callSessionRpc("table_create", payload)) as CreatedTable;
      const matchId = res?.match_id;
      setCreated({ match_id: matchId, room_id: res?.room_id, code: res?.code });
      if (matchId && connected) {
        // Join the match socket → the lobby routes to /table on matchId.
        await joinRoom(matchId);
      }
    } catch (e) {
      // Offline / guest with no reachable backend: show a clearly-labeled demo
      // confirmation rather than a hard failure. Never presented as live.
      if (!connected) {
        setCreated({ demo: true, code: demoRoomCode(), room_id: name.trim() || fallbackName });
      } else {
        setError(e instanceof Error ? e.message : "Could not create the table");
      }
    } finally {
      setBusy(false);
    }
  }, [
    sponsorClubs,
    sponsorClub,
    isPublic,
    variant,
    name,
    blinds,
    buyInDollars,
    seats,
    bots,
    durationMins,
    inviteOnly,
    spectators,
    features,
    connected,
    joinRoom,
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ---- form column ---- */}
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {isPublic && sponsorClubs && sponsorClubs.length > 0 && (
          <Section title="Sponsoring Club" hint="Only clubs you operate (via me_roles) can sponsor a public game.">
            <div className="grid gap-2 sm:grid-cols-2">
              {sponsorClubs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSponsorClub(c.id)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition",
                    c.id === sponsorClub
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Table Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Table Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isPublic ? "Club Public Game" : "High Rollers Lounge"}
                maxLength={40}
              />
            </Field>
            <Field label="Game Variant">
              <Segmented
                options={[
                  { value: "holdem", label: "Texas Hold'em" },
                  { value: "plo", label: "Pot-Limit Omaha" },
                ]}
                value={variant}
                onChange={(v) => setVariant(v as Variant)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Stakes">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Blinds
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500">
              <input
                type="checkbox"
                checked={customBlinds}
                onChange={(e) => setCustomBlinds(e.target.checked)}
                className="accent-[#e01e2b]"
              />
              Custom
            </label>
          </div>

          {!customBlinds ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-4">
              <Field label={`Small Blind — ${formatCents(blinds.sb)}`}>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={sbDollars}
                  onChange={(e) => setSbDollars(Math.max(0.5, Number(e.target.value)))}
                />
              </Field>
              <Field label={`Big Blind — ${formatCents(blinds.bb)}`}>
                <Input
                  type="number"
                  min={1}
                  step={0.5}
                  value={bbDollars}
                  onChange={(e) => setBbDollars(Math.max(1, Number(e.target.value)))}
                />
              </Field>
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Buy-in
              </span>
              <span className="font-display text-sm font-bold text-gold">
                {formatCents(Math.round(buyInDollars * 100))}
              </span>
            </div>
            <input
              type="range"
              min={MIN_BUY_IN_CENTS / 100}
              max={MAX_BUY_IN_CENTS / 100}
              step={50}
              value={buyInDollars}
              onChange={(e) => setBuyInDollars(Number(e.target.value))}
              className="mt-3 w-full accent-[#f5c518]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
              <span>{formatCents(MIN_BUY_IN_CENTS)}</span>
              <span>{formatCents(MAX_BUY_IN_CENTS)}</span>
            </div>
          </div>
        </Section>

        <Section title="Table Size">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Seats
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setSeats(n);
                  if (bots > n - 1) setBots(n - 1);
                }}
                className={cn(
                  "h-11 w-11 rounded-xl border text-sm font-bold transition",
                  n === seats
                    ? "border-gold/50 bg-gradient-to-br from-[#ffd54a]/20 to-[#d4a80f]/20 text-gold"
                    : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25",
                )}
              >
                {n}
              </button>
            ))}
          </div>

          {!isPublic && (
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  AI Bots
                </span>
                <span className="text-sm font-semibold text-brand">{bots}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, seats - 1)}
                step={1}
                value={bots}
                onChange={(e) => setBots(Number(e.target.value))}
                className="mt-3 w-full accent-[#e01e2b]"
              />
              <p className="mt-1 text-[10px] text-neutral-600">
                Fill empty seats with AI opponents — at least one seat stays open for you.
              </p>
            </div>
          )}
        </Section>

        <Section title="Table Features">
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURE_TOGGLES.map((f) => (
              <ToggleRow
                key={f.key}
                label={f.label}
                blurb={f.blurb}
                on={features[f.key]}
                onToggle={() => toggleFeature(f.key)}
              />
            ))}
          </div>
        </Section>

        <Section title="Access & Duration">
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow
              label="Invite-Only"
              blurb="Table is hidden from the public list — join by room code only."
              on={inviteOnly}
              onToggle={() => setInviteOnly((v) => !v)}
            />
            <ToggleRow
              label="Allow Spectators"
              blurb="Let non-seated members rail the action without playing."
              on={spectators}
              onToggle={() => setSpectators((v) => !v)}
            />
          </div>
          <div className="mt-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Auto-close
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.mins}
                  type="button"
                  onClick={() => setDurationMins(d.mins)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                    d.mins === durationMins
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <button
          type="button"
          onClick={onBack}
          className="text-xs uppercase tracking-[0.2em] text-neutral-500 transition hover:text-foreground"
        >
          ← Back to game modes
        </button>
      </div>

      {/* ---- sticky summary / preview column ---- */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className={cn(GLASS_PANEL, "overflow-hidden p-5")}>
          <p className={HEADING_SM}>Live Preview</p>
          <SeatRing seats={seats} bots={isPublic ? 0 : bots} />
          <dl className="mt-4 space-y-2 text-sm">
            <SummaryRow k="Variant" v={variant === "plo" ? "Pot-Limit Omaha" : "Texas Hold'em"} />
            <SummaryRow k="Blinds" v={`${formatCents(blinds.sb)} / ${formatCents(blinds.bb)}`} />
            <SummaryRow k="Buy-in" v={formatCents(Math.round(buyInDollars * 100))} />
            <SummaryRow k="Seats" v={`${seats}${!isPublic && bots ? ` · ${bots} bot${bots > 1 ? "s" : ""}` : ""}`} />
            <SummaryRow k="Access" v={inviteOnly ? "Invite-only" : "Open"} />
            <SummaryRow
              k="Features"
              v={
                [
                  features.bombPot && "Bomb",
                  features.straddle && "Straddle",
                  features.runItTwice && "RIT",
                  features.ante && "Ante",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Standard"
              }
            />
          </dl>

          <button
            type="button"
            disabled={busy || (isPublic && !sponsorClub)}
            onClick={() => void create()}
            className={cn(
              BTN_GOLD,
              "mt-5 w-full rounded-xl px-5 py-3 text-sm uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {busy
              ? "Creating…"
              : isPublic
                ? "Launch Public Game"
                : "Create Private Table"}
          </button>

          {!isPublic && (
            <button
              type="button"
              disabled={busy || matchmakerSearching}
              onClick={() => void findMatch()}
              className="mt-2 w-full rounded-xl border border-brand/40 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-brand transition hover:bg-brand/5 disabled:opacity-40"
            >
              {matchmakerSearching ? "Searching…" : "Quick Match Instead"}
            </button>
          )}

          <p className="mt-3 text-center text-[10px] text-neutral-600">
            Wallet {formatCents(profile.walletCents)} · stakes are capped by your plan
          </p>
        </div>

        {created && (
          <div
            className={cn(
              GLASS_PANEL,
              "border-gold/30 p-5",
              created.demo && "border-amber-400/30",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(245,197,24,0.6)]" />
              <p className={cn(HEADING_SM, "text-gold")}>
                {created.demo ? "Demo (offline)" : "Table Created"}
              </p>
            </div>
            {created.demo && (
              <p className="mt-2 text-[11px] text-amber-200/80">
                No backend reachable — this is a demo confirmation, not a live table.
              </p>
            )}
            {created.code && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Room Code</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-green">
                  {created.code}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Friends join at <span className="text-neutral-300">/lobby?code={created.code}</span>
                </p>
              </div>
            )}
            {!created.demo && created.match_id && (
              <p className="mt-3 text-[11px] text-neutral-400">
                {connected ? "Seating you now…" : "Sign in to take your seat."}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ---- small building blocks -------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cn(GLASS_PANEL, "p-5")}>
      <p className={HEADING_SM}>{title}</p>
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-neutral-500">{k}</dt>
      <dd className="text-right text-sm font-semibold text-foreground">{v}</dd>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
            o.value === value
              ? "border-brand/50 bg-brand/10 text-brand"
              : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  blurb,
  on,
  onToggle,
}: {
  label: string;
  blurb: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition",
        on
          ? "border-green/40 bg-green/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25",
      )}
    >
      <span>
        <span className={cn("text-sm font-semibold", on ? "text-green" : "text-foreground")}>
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-neutral-500">{blurb}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition",
          on ? "border-green/50 bg-green/20" : "border-white/15 bg-white/5",
        )}
      >
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full transition",
            on ? "translate-x-4 bg-green shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-neutral-500",
          )}
        />
      </span>
    </button>
  );
}

function SeatRing({ seats, bots }: { seats: number; bots: number }) {
  const filled = Math.min(bots, seats);
  return (
    <div className="relative mx-auto mt-3 aspect-[4/3] w-full max-w-[240px]">
      {/* felt bed */}
      <div
        aria-hidden
        className="absolute inset-x-4 inset-y-8 rounded-[50%] border border-gold/25"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 45%, rgba(10,125,67,0.5), rgba(10,125,67,0.2) 60%, rgba(5,56,33,0.1))",
          boxShadow: "inset 0 0 24px rgba(0,0,0,0.5)",
        }}
      />
      {Array.from({ length: seats }).map((_, i) => {
        const angle = (i / seats) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(angle) * 44;
        const y = 50 + Math.sin(angle) * 40;
        const isBot = i > 0 && i <= filled;
        const isHero = i === 0;
        return (
          <span
            key={i}
            className={cn(
              "absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border transition",
              isHero
                ? "border-gold bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] shadow-[0_0_12px_rgba(245,197,24,0.5)]"
                : isBot
                  ? "border-green/50 bg-green/20 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                  : "border-white/15 bg-white/[0.03]",
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { PlayingCard } from "@/features/audit/Card";
import { trainerApi, type CfrAdvice, type CoachTip, type GtoAdvice } from "@/features/trainer/trainerRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

const RANKS = "AKQJT98765432".split("");
const SUITS = "shdc".split("");
type Slot = "hero" | "board" | "villain";
const LIMITS: Record<Slot, number> = { hero: 2, board: 5, villain: 2 };

function useCards() {
  const [hero, setHero] = useState<string[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [villain, setVillain] = useState<string[]>([]);
  const groups = { hero, board, villain };
  const setters = { hero: setHero, board: setBoard, villain: setVillain };
  const used = useMemo(() => new Set([...hero, ...board, ...villain]), [hero, board, villain]);
  return { hero, board, villain, groups, setters, used };
}

export default function TrainerPage() {
  const { hero, board, villain, groups, setters, used } = useCards();
  const [target, setTarget] = useState<Slot>("hero");
  const [pot, setPot] = useState(100);
  const [toCall, setToCall] = useState(50);
  const [heroStack, setHeroStack] = useState(1000);
  const [villainStack, setVillainStack] = useState(1000);

  const [rank, setRank] = useState<string | null>(null);
  const [equity, setEquity] = useState<number[] | null>(null);
  const [advice, setAdvice] = useState<GtoAdvice | null>(null);
  const [cfr, setCfr] = useState<CfrAdvice | null>(null);
  const [tip, setTip] = useState<CoachTip | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroStr = hero.join("");
  const boardStr = board.join("");
  const villainStr = villain.join("");

  const pick = useCallback(
    (card: string) => {
      // Remove if already used; else add to the target group if it has room.
      for (const s of ["hero", "board", "villain"] as Slot[]) {
        if (groups[s].includes(card)) {
          setters[s]((prev) => prev.filter((c) => c !== card));
          return;
        }
      }
      const grp = groups[target];
      if (grp.length >= LIMITS[target]) return;
      setters[target]((prev) => [...prev, card]);
    },
    [groups, setters, target],
  );

  const run = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(name);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Solver call failed.");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const evalHand = () =>
    run("rank", async () => {
      const res = await trainerApi.handRank(heroStr + boardStr);
      setRank(res.category ? res.category.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ") : "—");
    });

  const calcEquity = () =>
    run("equity", async () => {
      const res = await trainerApi.equity([heroStr, villainStr], boardStr);
      setEquity(res.equity ?? null);
    });

  const getAdvice = () =>
    run("advice", async () => {
      setAdvice(
        await trainerApi.gtoAdvise({
          hero_hole: heroStr,
          villain_holes: villainStr ? [villainStr] : [],
          board: boardStr,
          pot,
          to_call: toCall,
        }),
      );
    });

  const solve = () =>
    run("solve", async () => {
      setCfr(
        await trainerApi.gtoSolve({
          hero_hole: heroStr,
          villain_hole: villainStr,
          board: boardStr,
          hero_stack: heroStack,
          villain_stack: villainStack,
          pot,
          to_call: toCall,
        }),
      );
    });

  const coach = () =>
    run("tip", async () => {
      setTip(
        await trainerApi.coachingTip({
          hero_hole: heroStr,
          villain_holes: villainStr ? [villainStr] : [],
          board: boardStr,
          pot,
          to_call: toCall,
        }),
      );
    });

  const pct = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">Practice</p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide">GTO Trainer</h1>
            <p className="mt-1 text-sm text-muted">
              Solve any spot against the same rs_poker engine that runs the tables. Practice only —
              never available at live-stakes tables.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white">
            ← Back
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: card selection + inputs */}
          <div className={cn(GLASS_PANEL, "p-5")}>
            <div className="space-y-4">
              {(["hero", "board", "villain"] as Slot[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setTarget(s)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    target === s ? "border-gold/50 bg-gold/[0.06]" : "border-white/10 hover:border-white/20",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {s === "hero" ? "Your hand" : s === "villain" ? "Villain (optional)" : "Board"}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {groups[s].length}/{LIMITS[s]}
                    </span>
                  </div>
                  <div className="mt-2 flex min-h-[3rem] flex-wrap gap-1.5">
                    {groups[s].length === 0 ? (
                      <span className="self-center text-xs text-neutral-600">
                        {target === s ? "Tap cards below to add" : "Empty"}
                      </span>
                    ) : (
                      groups[s].map((c) => <PlayingCard key={c} card={c} size="sm" />)
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* 52-card grid */}
            <div className="mt-4 space-y-1">
              {SUITS.map((suit) => (
                <div key={suit} className="flex flex-wrap gap-1">
                  {RANKS.map((r) => {
                    const card = r + suit;
                    const isUsed = used.has(card);
                    return (
                      <button
                        key={card}
                        onClick={() => pick(card)}
                        className={cn(
                          "h-8 w-7 rounded border text-[11px] font-bold transition",
                          isUsed
                            ? "border-gold/50 bg-gold/15 text-gold"
                            : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/25 hover:text-white",
                        )}
                      >
                        {r}
                        <span
                          style={{
                            color:
                              suit === "h" ? "#e5484d" : suit === "d" ? "#2f6bff" : suit === "c" ? "#1fa85a" : "#c7ccd6",
                          }}
                        >
                          {suit === "s" ? "♠" : suit === "h" ? "♥" : suit === "d" ? "♦" : "♣"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Numeric inputs */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Pot", pot, setPot],
                ["To call", toCall, setToCall],
                ["Your stack", heroStack, setHeroStack],
                ["Villain stack", villainStack, setVillainStack],
              ].map(([label, val, set]) => (
                <label key={label as string} className="text-[11px] text-muted">
                  {label as string}
                  <input
                    type="number"
                    value={val as number}
                    onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/50"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Right: actions + results */}
          <div className={cn(GLASS_PANEL, "p-5")}>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={evalHand} disabled={hero.length < 2 || !!busy} className={btn}>
                {busy === "rank" ? "…" : "Hand strength"}
              </button>
              <button onClick={calcEquity} disabled={hero.length < 2 || villain.length < 2 || !!busy} className={btn}>
                {busy === "equity" ? "…" : "Equity vs villain"}
              </button>
              <button onClick={getAdvice} disabled={hero.length < 2 || !!busy} className={btn}>
                {busy === "advice" ? "…" : "GTO advice"}
              </button>
              <button onClick={solve} disabled={hero.length < 2 || villain.length < 2 || !!busy} className={btn}>
                {busy === "solve" ? "solving…" : "Solve (CFR)"}
              </button>
              <button onClick={coach} disabled={hero.length < 2 || !!busy} className={cn(btn, "col-span-2")}>
                {busy === "tip" ? "…" : "Coaching tip"}
              </button>
            </div>

            {error && <p className="mt-3 text-sm text-brand">{error}</p>}

            <div className="mt-4 space-y-3">
              {rank && (
                <Result label="Hand strength">
                  <span className="capitalize text-foreground">{rank}</span>
                </Result>
              )}
              {equity && (
                <Result label="Equity">
                  <span className="text-green">You {pct(equity[0])}</span>
                  {equity[1] != null && <span className="ml-3 text-muted">Villain {pct(equity[1])}</span>}
                </Result>
              )}
              {advice && (
                <Result label="GTO advice (equity heuristic)">
                  <p className="font-semibold uppercase text-gold">{advice.suggested_action}</p>
                  <p className="mt-1 text-xs text-muted">
                    Equity {pct(advice.hero_equity)} · Pot odds {pct(advice.pot_odds)} · EV call{" "}
                    {advice.ev_call?.toFixed(1) ?? "—"}
                  </p>
                  {advice.rationale && <p className="mt-1 text-xs text-neutral-400">{advice.rationale}</p>}
                </Result>
              )}
              {cfr && (
                <Result label="CFR solve (rs_poker)">
                  <p className="font-semibold uppercase text-gold">
                    {cfr.suggested_action} {cfr.amount ? cfr.amount.toFixed(0) : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Equity {pct(cfr.hero_equity)} · {cfr.nodes_explored?.toLocaleString() ?? 0} nodes ·{" "}
                    {cfr.converged ? "converged" : "time-bounded"}
                  </p>
                </Result>
              )}
              {tip && (
                <Result label="Coaching">
                  {tip.alert && <p className="font-semibold text-gold">{tip.alert}</p>}
                  {tip.suggestion && <p className="mt-1 text-sm text-foreground">{tip.suggestion}</p>}
                  {tip.rationale && <p className="mt-1 text-xs text-neutral-400">{tip.rationale}</p>}
                </Result>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const btn =
  "rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm font-semibold hover:border-gold/40 hover:text-white disabled:opacity-30";

function Result({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

"use client";
// ── Hand History Browser ─────────────────────────────────────────────────────
// Browse, filter, and replay past hands. Shows pot size, result, hole cards,
// board, and a mini action timeline.
import { useState } from "react";
import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

type Hand = {
  id: string;
  date: string;
  game: string;
  stakes: string;
  position: string;
  holeCards: string[];
  board: string[];
  result: number; // cents
  potSize: number;
  action: string;
  players: number;
  wonShowdown: boolean;
};

const DEMO_HANDS: Hand[] = [
  { id: "h1", date: "Today 22:14", game: "No Limit Hold'em", stakes: "NL500", position: "BTN", holeCards: ["A♠","K♠"], board: ["K♥","7♦","2♣","J♠","3♥"], result: 48000, potSize: 96000, action: "Value bet river, called", players: 6, wonShowdown: true },
  { id: "h2", date: "Today 21:58", game: "No Limit Hold'em", stakes: "NL500", position: "BB",  holeCards: ["Q♥","Q♦"], board: ["A♠","K♣","4♦","Q♠","8♥"], result: 22000, potSize: 44000, action: "Flopped set, won at showdown", players: 6, wonShowdown: true },
  { id: "h3", date: "Today 21:42", game: "No Limit Hold'em", stakes: "NL500", position: "CO",  holeCards: ["J♠","T♠"], board: ["9♠","8♦","2♠","K♥","5♣"], result: -15000, potSize: 30000, action: "Flush draw missed, folded turn", players: 4, wonShowdown: false },
  { id: "h4", date: "Today 21:31", game: "No Limit Hold'em", stakes: "NL500", position: "UTG", holeCards: ["A♦","A♣"], board: ["K♠","Q♥","J♦","T♣","9♠"], result: -50000, potSize: 100000, action: "Lost to straight on board", players: 3, wonShowdown: false },
  { id: "h5", date: "Today 21:15", game: "No Limit Hold'em", stakes: "NL500", position: "SB",  holeCards: ["7♣","6♣"], board: ["8♣","5♣","2♦","4♣","K♥"], result: 35000, potSize: 70000, action: "Flopped flush draw, made flush", players: 5, wonShowdown: true },
  { id: "h6", date: "Today 20:58", game: "No Limit Hold'em", stakes: "NL500", position: "HJ",  holeCards: ["K♣","Q♣"], board: ["K♦","Q♠","7♥","2♣","J♦"], result: 28000, potSize: 56000, action: "Two pair, value bet all streets", players: 6, wonShowdown: true },
  { id: "h7", date: "Today 20:44", game: "No Limit Hold'em", stakes: "NL500", position: "BTN", holeCards: ["T♦","9♦"], board: ["J♠","8♣","7♦","A♥","K♠"], result: -8000, potSize: 16000, action: "Straight, lost to flush", players: 2, wonShowdown: false },
  { id: "h8", date: "Today 20:30", game: "No Limit Hold'em", stakes: "NL500", position: "BB",  holeCards: ["5♠","5♦"], board: ["5♥","K♣","2♠","Q♦","8♣"], result: 42000, potSize: 84000, action: "Set of fives, slow played", players: 4, wonShowdown: true },
];

const SUIT_COLOR: Record<string, string> = {
  "♠": "#e2e8f0", "♣": "#e2e8f0", "♥": "#ff4455", "♦": "#ff4455",
};

function CardPip({ card }: { card: string }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const color = SUIT_COLOR[suit] ?? "#e2e8f0";
  return (
    <span
      className="inline-flex h-8 w-6 items-center justify-center rounded-md border text-[11px] font-bold"
      style={{
        color,
        borderColor: `${color}30`,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {rank}<span className="text-[9px]">{suit}</span>
    </span>
  );
}

function HandRow({ hand, selected, onClick }: { hand: Hand; selected: boolean; onClick: () => void }) {
  const isWin = hand.result > 0;
  const resultColor = isWin ? "#22c55e" : "#ff4455";
  const resultLabel = `${isWin ? "+" : ""}$${(Math.abs(hand.result) / 100).toFixed(0)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-[#f5c518]/40 bg-[#f5c518]/[0.06] shadow-[0_2px_12px_rgba(245,197,24,0.10)]"
          : "border-white/[0.06] bg-[#181e27] hover:border-white/[0.12] hover:bg-[#1e2535]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Hole cards */}
          <div className="flex gap-0.5 shrink-0">
            {hand.holeCards.map((c, i) => <CardPip key={i} card={c} />)}
          </div>
          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{hand.action}</span>
              {hand.wonShowdown && (
                <span className="shrink-0 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#22c55e]">
                  Won
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
              <span>{hand.stakes}</span>
              <span>·</span>
              <span>{hand.position}</span>
              <span>·</span>
              <span>{hand.players} players</span>
              <span>·</span>
              <span>{hand.date}</span>
            </div>
          </div>
        </div>
        {/* Result */}
        <span className="shrink-0 font-display text-lg font-bold tabular-nums" style={{ color: resultColor }}>
          {resultLabel}
        </span>
      </div>
    </button>
  );
}

function HandDetail({ hand }: { hand: Hand }) {
  const isWin = hand.result > 0;
  const resultColor = isWin ? "#22c55e" : "#ff4455";

  return (
    <div className={cn(GLASS_PANEL, "p-5 space-y-5")}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">{hand.game}</h3>
          <p className="text-xs text-neutral-500">{hand.date} · {hand.stakes} · {hand.position} position</p>
        </div>
        <span className="font-display text-2xl font-bold tabular-nums" style={{ color: resultColor }}>
          {isWin ? "+" : ""}${(Math.abs(hand.result) / 100).toFixed(0)}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Your Hand</p>
          <div className="flex gap-1.5">
            {hand.holeCards.map((c, i) => (
              <span
                key={i}
                className="flex h-12 w-9 items-center justify-center rounded-lg border text-base font-bold"
                style={{
                  color: SUIT_COLOR[c.slice(-1)] ?? "#e2e8f0",
                  borderColor: `${SUIT_COLOR[c.slice(-1)] ?? "#e2e8f0"}30`,
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                {c.slice(0, -1)}<span className="text-xs">{c.slice(-1)}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Board</p>
          <div className="flex gap-1.5 flex-wrap">
            {hand.board.map((c, i) => (
              <span
                key={i}
                className="flex h-12 w-9 items-center justify-center rounded-lg border text-base font-bold"
                style={{
                  color: SUIT_COLOR[c.slice(-1)] ?? "#e2e8f0",
                  borderColor: `${SUIT_COLOR[c.slice(-1)] ?? "#e2e8f0"}30`,
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {c.slice(0, -1)}<span className="text-xs">{c.slice(-1)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pot Size", value: `$${(hand.potSize / 100).toFixed(0)}`, tone: "neutral" },
          { label: "Players", value: hand.players, tone: "neutral" },
          { label: "Result", value: `${isWin ? "+" : ""}$${(Math.abs(hand.result) / 100).toFixed(0)}`, tone: isWin ? "green" : "red" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.20em] text-neutral-500">{s.label}</p>
            <p
              className="mt-1 font-display text-lg font-bold"
              style={{ color: s.tone === "green" ? "#22c55e" : s.tone === "red" ? "#ff4455" : "white" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Action summary */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">Action Summary</p>
        <p className="text-sm text-neutral-300">{hand.action}</p>
      </div>

      {/* Replay button */}
      <button
        type="button"
        className="w-full rounded-xl border border-[#f5c518]/30 bg-[#f5c518]/10 py-2.5 text-sm font-bold uppercase tracking-wide text-[#f5c518] transition hover:bg-[#f5c518]/20"
      >
        ▶ Replay Hand
      </button>
    </div>
  );
}

export function HandHistoryBrowser() {
  const [selected, setSelected] = useState<string | null>(DEMO_HANDS[0].id);
  const [filter, setFilter] = useState<"all" | "won" | "lost">("all");
  const [search, setSearch] = useState("");

  const filtered = DEMO_HANDS.filter((h) => {
    if (filter === "won" && h.result <= 0) return false;
    if (filter === "lost" && h.result >= 0) return false;
    if (search && !h.holeCards.join("").toLowerCase().includes(search.toLowerCase()) &&
        !h.action.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selectedHand = DEMO_HANDS.find((h) => h.id === selected);
  const totalWon = DEMO_HANDS.reduce((acc, h) => acc + h.result, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">Hand History</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {DEMO_HANDS.length} hands · Session total:{" "}
            <span className={totalWon >= 0 ? "text-[#22c55e] font-semibold" : "text-[#ff4455] font-semibold"}>
              {totalWon >= 0 ? "+" : ""}${(totalWon / 100).toFixed(0)}
            </span>
          </p>
        </div>
        <button type="button" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutral-400 hover:text-white transition">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
          {(["all", "won", "lost"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition",
                filter === f
                  ? f === "won" ? "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/25"
                    : f === "lost" ? "bg-[#ff4455]/10 text-[#ff4455] border border-[#ff4455]/25"
                    : "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25"
                  : "text-neutral-500 hover:text-white",
              )}
            >
              {f === "all" ? "All Hands" : f === "won" ? "Won" : "Lost"}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search hands…"
          className="flex-1 min-w-[160px] rounded-xl border border-white/[0.10] bg-[#0f1318]/80 px-4 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-[#f5c518]/50"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Hand list */}
        <div className="space-y-2">
          {filtered.map((hand) => (
            <HandRow
              key={hand.id}
              hand={hand}
              selected={selected === hand.id}
              onClick={() => setSelected(hand.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] py-12 text-center">
              <p className="text-sm text-neutral-500">No hands match your filter</p>
            </div>
          )}
        </div>
        {/* Detail panel */}
        <div className="lg:sticky lg:top-6">
          {selectedHand ? (
            <HandDetail hand={selectedHand} />
          ) : (
            <div className={cn(GLASS_PANEL, "flex items-center justify-center py-16 text-center")}>
              <p className="text-sm text-neutral-500">Select a hand to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

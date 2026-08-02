"use client";
// ── Range Trainer ────────────────────────────────────────────────────────────
// Interactive poker hand range trainer. Shows a 13x13 hand matrix,
// lets users define opening/calling/3bet ranges by position, and quizzes them.
import { useState } from "react";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";
type Action = "open" | "call" | "3bet" | "fold";
type Mode = "view" | "quiz";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

// GTO-approximate ranges for each position (simplified)
const GTO_RANGES: Record<Position, Record<string, Action>> = {
  UTG: {
    "AA": "open", "KK": "open", "QQ": "open", "JJ": "open", "TT": "open", "99": "open",
    "AKs": "open", "AQs": "open", "AJs": "open", "ATs": "open",
    "AKo": "open", "AQo": "open",
    "KQs": "open", "KJs": "open", "KTs": "open",
    "QJs": "open", "QTs": "open",
    "JTs": "open",
    "88": "open", "77": "open",
  },
  HJ: {
    "AA": "open", "KK": "open", "QQ": "open", "JJ": "open", "TT": "open", "99": "open", "88": "open",
    "AKs": "open", "AQs": "open", "AJs": "open", "ATs": "open", "A9s": "open",
    "AKo": "open", "AQo": "open", "AJo": "open",
    "KQs": "open", "KJs": "open", "KTs": "open", "K9s": "open",
    "QJs": "open", "QTs": "open", "Q9s": "open",
    "JTs": "open", "J9s": "open",
    "T9s": "open", "77": "open", "66": "open",
  },
  CO: {
    "AA": "open", "KK": "open", "QQ": "open", "JJ": "open", "TT": "open", "99": "open", "88": "open", "77": "open", "66": "open",
    "AKs": "open", "AQs": "open", "AJs": "open", "ATs": "open", "A9s": "open", "A8s": "open", "A7s": "open",
    "AKo": "open", "AQo": "open", "AJo": "open", "ATo": "open",
    "KQs": "open", "KJs": "open", "KTs": "open", "K9s": "open", "K8s": "open",
    "QJs": "open", "QTs": "open", "Q9s": "open",
    "JTs": "open", "J9s": "open", "J8s": "open",
    "T9s": "open", "T8s": "open", "98s": "open",
  },
  BTN: {
    "AA": "open", "KK": "open", "QQ": "open", "JJ": "open", "TT": "open", "99": "open", "88": "open", "77": "open", "66": "open", "55": "open", "44": "open", "33": "open", "22": "open",
    "AKs": "open", "AQs": "open", "AJs": "open", "ATs": "open", "A9s": "open", "A8s": "open", "A7s": "open", "A6s": "open", "A5s": "open", "A4s": "open", "A3s": "open", "A2s": "open",
    "AKo": "open", "AQo": "open", "AJo": "open", "ATo": "open", "A9o": "open", "A8o": "open",
    "KQs": "open", "KJs": "open", "KTs": "open", "K9s": "open", "K8s": "open", "K7s": "open", "K6s": "open",
    "KQo": "open", "KJo": "open", "KTo": "open",
    "QJs": "open", "QTs": "open", "Q9s": "open", "Q8s": "open",
    "QJo": "open", "QTo": "open",
    "JTs": "open", "J9s": "open", "J8s": "open", "J7s": "open",
    "JTo": "open",
    "T9s": "open", "T8s": "open", "T7s": "open",
    "98s": "open", "97s": "open", "87s": "open", "76s": "open", "65s": "open",
  },
  SB: {
    "AA": "open", "KK": "open", "QQ": "open", "JJ": "open", "TT": "open", "99": "open", "88": "open", "77": "open", "66": "open", "55": "open",
    "AKs": "open", "AQs": "open", "AJs": "open", "ATs": "open", "A9s": "open", "A8s": "open", "A7s": "open", "A6s": "open", "A5s": "open",
    "AKo": "open", "AQo": "open", "AJo": "open", "ATo": "open",
    "KQs": "open", "KJs": "open", "KTs": "open", "K9s": "open",
    "KQo": "open", "KJo": "open",
    "QJs": "open", "QTs": "open", "Q9s": "open",
    "JTs": "open", "J9s": "open",
    "T9s": "open", "T8s": "open", "98s": "open", "87s": "open",
  },
  BB: {
    "AA": "3bet", "KK": "3bet", "QQ": "3bet", "JJ": "3bet", "TT": "3bet",
    "AKs": "3bet", "AQs": "3bet", "AJs": "3bet",
    "AKo": "3bet", "AQo": "3bet",
    "99": "call", "88": "call", "77": "call", "66": "call", "55": "call", "44": "call", "33": "call", "22": "call",
    "ATs": "call", "A9s": "call", "A8s": "call", "A7s": "call", "A6s": "call", "A5s": "call", "A4s": "call", "A3s": "call", "A2s": "call",
    "AJo": "call", "ATo": "call",
    "KQs": "call", "KJs": "call", "KTs": "call", "K9s": "call",
    "KQo": "call", "KJo": "call",
    "QJs": "call", "QTs": "call",
    "JTs": "call", "T9s": "call", "98s": "call",
  },
};

const ACTION_COLORS: Record<Action, { bg: string; border: string; text: string }> = {
  open: { bg: "rgba(34,197,94,0.25)",   border: "rgba(34,197,94,0.60)",   text: "#22c55e" },
  call: { bg: "rgba(245,197,24,0.20)",  border: "rgba(245,197,24,0.55)",  text: "#f5c518" },
  "3bet": { bg: "rgba(167,139,250,0.20)", border: "rgba(167,139,250,0.55)", text: "#a78bfa" },
  fold: { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.08)", text: "#6b7280" },
};

function handKey(r1: string, r2: string): string {
  const ri1 = RANKS.indexOf(r1);
  const ri2 = RANKS.indexOf(r2);
  if (ri1 === ri2) return `${r1}${r2}`; // pair
  if (ri1 < ri2) return `${r1}${r2}s`; // suited (upper triangle)
  return `${r2}${r1}o`; // offsuit (lower triangle)
}

export function RangeTrainer() {
  const [position, setPosition] = useState<Position>("BTN");
  const [mode, setMode] = useState<Mode>("view");
  const [quizHand, setQuizHand] = useState<string | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<Action | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const range = GTO_RANGES[position];

  function startQuiz() {
    setMode("quiz");
    setScore({ correct: 0, total: 0 });
    nextQuizHand();
  }

  function nextQuizHand() {
    const allHands: string[] = [];
    for (let i = 0; i < RANKS.length; i++) {
      for (let j = 0; j < RANKS.length; j++) {
        allHands.push(handKey(RANKS[i], RANKS[j]));
      }
    }
    const random = allHands[Math.floor(Math.random() * allHands.length)];
    setQuizHand(random);
    setQuizAnswer(null);
  }

  function answerQuiz(action: Action) {
    if (!quizHand) return;
    const correct = range[quizHand] ?? "fold";
    setQuizAnswer(action);
    setScore((s) => ({
      correct: s.correct + (action === correct ? 1 : 0),
      total: s.total + 1,
    }));
    setTimeout(nextQuizHand, 800);
  }

  const rangeCount = Object.keys(range).length;
  const totalCombos = 169;
  const rangePct = Math.round((rangeCount / totalCombos) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">Range Trainer</h1>
          <p className="mt-0.5 text-xs text-neutral-500">Study GTO opening ranges by position</p>
        </div>
        <button
          type="button"
          onClick={() => mode === "quiz" ? setMode("view") : startQuiz()}
          className={cn(
            "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition",
            mode === "quiz"
              ? "border border-white/10 text-neutral-400 hover:text-white"
              : "bg-gradient-to-r from-[#92700a] to-[#f5c518] text-black shadow-[0_2px_12px_rgba(245,197,24,0.25)] hover:brightness-110",
          )}
        >
          {mode === "quiz" ? "← View Range" : "Start Quiz"}
        </button>
      </div>

      {/* Position selector */}
      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
        {(["UTG", "HJ", "CO", "BTN", "SB", "BB"] as Position[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosition(p)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition",
              position === p
                ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25"
                : "text-neutral-500 hover:text-white",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {mode === "view" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Range Size", value: `${rangePct}%`, color: "#f5c518" },
              { label: "Hands", value: rangeCount, color: "white" },
              { label: "Position", value: position, color: "#22c55e" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-[#181e27] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.20em] text-neutral-500">{s.label}</p>
                <p className="mt-1 font-display text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {(Object.entries(ACTION_COLORS) as [Action, typeof ACTION_COLORS[Action]][]).map(([action, style]) => (
              <div key={action} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: style.bg, border: `1px solid ${style.border}` }} />
                <span className="text-[11px] font-semibold capitalize" style={{ color: style.text }}>{action}</span>
              </div>
            ))}
          </div>

          {/* 13x13 Matrix */}
          <div className={cn(GLASS_PANEL, "p-4 overflow-x-auto")}>
            <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(14, minmax(0, 1fr))` }}>
              {/* Corner */}
              <div />
              {/* Column headers */}
              {RANKS.map((r) => (
                <div key={r} className="flex h-7 w-7 items-center justify-center text-[10px] font-bold text-neutral-500">
                  {r}
                </div>
              ))}
              {/* Rows */}
              {RANKS.map((r1, i) => (
                <>
                  {/* Row header */}
                  <div key={`h-${r1}`} className="flex h-7 w-7 items-center justify-center text-[10px] font-bold text-neutral-500">
                    {r1}
                  </div>
                  {/* Cells */}
                  {RANKS.map((r2, j) => {
                    const key = handKey(r1, r2);
                    const action: Action = (range[key] as Action) ?? "fold";
                    const style = ACTION_COLORS[action];
                    const isPair = i === j;
                    const isSuited = i < j;
                    return (
                      <div
                        key={`${r1}${r2}`}
                        title={`${key} — ${action}`}
                        className="flex h-7 w-7 items-center justify-center rounded text-[8px] font-bold cursor-pointer transition hover:brightness-125"
                        style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}
                      >
                        {isPair ? r1+r2 : isSuited ? "s" : "o"}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === "quiz" && (
        <div className={cn(GLASS_PANEL, "p-8 flex flex-col items-center gap-6 text-center")}>
          {/* Score */}
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Correct</p>
              <p className="font-display text-2xl font-bold text-[#22c55e]">{score.correct}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Total</p>
              <p className="font-display text-2xl font-bold text-white">{score.total}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Accuracy</p>
              <p className="font-display text-2xl font-bold text-[#f5c518]">
                {score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%
              </p>
            </div>
          </div>

          {/* Hand display */}
          <div>
            <p className="text-xs text-neutral-500 mb-3">Position: <span className="font-bold text-[#f5c518]">{position}</span> · What is the correct action?</p>
            <div className="font-display text-5xl font-bold text-white">{quizHand}</div>
          </div>

          {/* Answer buttons */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
            {(["open", "call", "3bet", "fold"] as Action[]).map((action) => {
              const style = ACTION_COLORS[action];
              const correct = quizHand ? (GTO_RANGES[position][quizHand] ?? "fold") : null;
              const isCorrect = quizAnswer === action && action === correct;
              const isWrong = quizAnswer === action && action !== correct;
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => !quizAnswer && answerQuiz(action)}
                  disabled={!!quizAnswer}
                  className={cn(
                    "rounded-xl border py-3 text-sm font-bold uppercase tracking-wide transition capitalize",
                    isCorrect ? "border-[#22c55e] bg-[#22c55e]/20 text-[#22c55e]" :
                    isWrong   ? "border-[#ff4455] bg-[#ff4455]/20 text-[#ff4455]" :
                    "hover:brightness-125",
                  )}
                  style={!quizAnswer ? { background: style.bg, borderColor: style.border, color: style.text } : undefined}
                >
                  {action}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

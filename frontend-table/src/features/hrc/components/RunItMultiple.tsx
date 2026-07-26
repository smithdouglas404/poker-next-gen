// Run It Multiple — vote panel and multi-board results display
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./Card";
import type { CardType } from "@/lib/poker-types";

// Vote panel
interface RunItVotePanelProps {
  onVote: (count: 1 | 2 | 3) => void;
}

export function RunItVotePanel({ onVote }: RunItVotePanelProps) {
  const [voted, setVoted] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const onVoteRef = useRef(onVote);
  onVoteRef.current = onVote;

  useEffect(() => {
    if (voted) return;
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          setVoted(true);
          onVoteRef.current(1); // auto-decline
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [voted]);

  const handleVote = (count: 1 | 2 | 3) => {
    if (voted) return;
    setVoted(true);
    onVote(count);
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="fixed top-1/3 left-1/2 -translate-x-1/2 z-[60]"
    >
      <div
        className="rounded-xl p-5 backdrop-blur-xl text-center"
        style={{
          background: "rgba(10,15,30,0.92)",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 0 30px rgba(212,175,55,0.1)",
        }}
      >
        <div className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-amber-400 mb-1">
          All-In Runout
        </div>
        <div className="text-xs text-gray-400 mb-2">
          How many times should the board run?
        </div>
        <div className="flex items-center justify-center mb-3">
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={countdown <= 3 ? "#ef4444" : "#d4af37"} strokeWidth="2" strokeDasharray={`${(countdown / 10) * 97.4} 97.4`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.3s ease" }} />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-mono font-bold ${countdown <= 3 ? "text-red-400" : "text-amber-300"}`}>{countdown}</span>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          {([1, 2, 3] as const).map(count => (
            <motion.button
              key={count}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleVote(count)}
              disabled={voted}
              className="px-5 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider text-white disabled:opacity-50 transition-colors"
              style={{
                background: count === 1
                  ? "linear-gradient(135deg, rgba(100,100,100,0.4), rgba(80,80,80,0.4))"
                  : count === 2
                  ? "linear-gradient(135deg, rgba(0,150,200,0.4), rgba(0,120,180,0.4))"
                  : "linear-gradient(135deg, rgba(0,180,220,0.5), rgba(0,140,180,0.5))",
                border: `1px solid ${count === 1 ? "rgba(255,255,255,0.15)" : "rgba(212,175,55,0.3)"}`,
                boxShadow: count > 1 ? "0 0 12px rgba(212,175,55,0.15)" : "none",
              }}
            >
              {count === 1 ? "Once" : count === 2 ? "Twice" : "Thrice"}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Results display for multiple boards
interface RunItBoard {
  communityCards: CardType[];
  winners: string[];
  potShare: number;
}

interface RunItResultsProps {
  boards: RunItBoard[];
  heroId: string;
}

export function RunItResults({ boards, heroId }: RunItResultsProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[55]"
    >
      <div
        className="rounded-xl p-4 backdrop-blur-xl"
        style={{
          background: "rgba(10,15,30,0.9)",
          border: "1px solid rgba(212,175,55,0.15)",
          boxShadow: "0 0 20px rgba(0,0,0,0.3)",
        }}
      >
        <div className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-amber-400 mb-3 text-center">
          Run It {boards.length === 2 ? "Twice" : "Thrice"}
        </div>
        <div className="space-y-2">
          {boards.map((board, i) => {
            const heroWon = board.winners.includes(heroId);
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{
                  background: heroWon ? "rgba(5,150,105,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${heroWon ? "rgba(5,150,105,0.3)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <span className="text-[0.5625rem] font-bold uppercase tracking-wider text-gray-500 w-16">
                  Board {i + 1}
                </span>
                <div className="flex gap-1">
                  {board.communityCards.map((card, j) => (
                    <Card key={j} card={card} size="sm" delay={0} />
                  ))}
                </div>
                <span className="text-xs font-mono font-bold ml-auto" style={{ color: "#ffd700" }}>
                  ${board.potShare.toLocaleString()}
                </span>
                {heroWon && (
                  <span className="text-[0.5625rem] font-bold text-green-400 uppercase">Win</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

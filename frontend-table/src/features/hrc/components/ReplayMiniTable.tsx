import { motion } from "framer-motion";
import { ReplaySnapshot } from "@/hooks/useHandReplayState";
import { TABLE_SEATS } from "@/lib/table-constants";
import { Coins } from "lucide-react";

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const SUIT_COLORS: Record<string, string> = {
  hearts: "text-red-500",
  diamonds: "text-blue-400",
  clubs: "text-green-400",
  spades: "text-white",
};

function MiniCard({ card, faceDown }: { card?: { suit: string; rank: string }; faceDown?: boolean }) {
  if (faceDown || !card) {
    return (
      <div className="w-7 h-10 rounded border border-amber-500/30 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0a1929, #132238)" }}
      >
        <div className="w-4 h-6 rounded-sm border border-amber-500/20" />
      </div>
    );
  }
  const color = SUIT_COLORS[card.suit] || "text-white";
  return (
    <div className={`w-7 h-10 rounded border border-white/15 flex flex-col items-center justify-center text-[0.5625rem] font-bold ${color}`}
      style={{ background: "rgba(255,255,255,0.07)" }}
    >
      <span className="leading-none">{card.rank}</span>
      <span className="text-[0.5rem] leading-none">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

export function ReplayMiniTable({ snapshot }: { snapshot: ReplaySnapshot }) {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{
        aspectRatio: "16/10",
        background: "radial-gradient(ellipse 80% 70% at 50% 50%, #1a4a3a 0%, #0d2e23 50%, #0a1f18 100%)",
        border: "3px solid rgba(212,175,55,0.15)",
        boxShadow: "0 0 40px rgba(212,175,55,0.06), inset 0 0 80px rgba(0,0,0,0.4)",
      }}
    >
      {/* Felt oval */}
      <div
        className="absolute inset-[8%] rounded-[50%]"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, #1e5a44 0%, #174a38 60%, #0d3325 100%)",
          border: "2px solid rgba(212,175,55,0.1)",
          boxShadow: "inset 0 2px 20px rgba(0,0,0,0.3)",
        }}
      />

      {/* Pot display */}
      {snapshot.pot > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/50 border border-amber-500/20 backdrop-blur-sm">
            <Coins className="w-3 h-3 text-amber-400" />
            <span className="text-xs font-bold font-mono text-amber-400">
              {snapshot.pot.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Community cards */}
      {snapshot.communityCards.length > 0 && (
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {snapshot.communityCards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <MiniCard card={card} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Player seats */}
      {snapshot.players.map((player) => {
        const seatPos = TABLE_SEATS[player.seatIndex % TABLE_SEATS.length];
        const isActive = snapshot.activePlayerId === player.id;

        return (
          <div
            key={player.id}
            className="absolute z-10"
            style={{
              left: `${seatPos.x}%`,
              top: `${seatPos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all ${
                player.isFolded ? "opacity-30" : ""
              }`}
              style={{
                background: isActive ? "rgba(212,175,55,0.12)" : "rgba(0,0,0,0.5)",
                border: `1px solid ${isActive ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive ? "0 0 12px rgba(212,175,55,0.2)" : "none",
                backdropFilter: "blur(8px)",
              }}
            >
              {/* Name */}
              <span className="text-[0.5625rem] font-bold text-white truncate max-w-[60px]">
                {player.displayName}
              </span>
              {/* Chips */}
              <span className="text-[0.5rem] font-mono text-gray-400">
                {player.chips.toLocaleString()}
              </span>
              {/* Cards */}
              <div className="flex gap-0.5">
                {player.holeCards ? (
                  player.holeCards.map((c, i) => (
                    <MiniCard key={i} card={c} />
                  ))
                ) : !player.isFolded ? (
                  <>
                    <MiniCard faceDown />
                    <MiniCard faceDown />
                  </>
                ) : null}
              </div>
              {/* Status badges */}
              {player.isFolded && (
                <span className="text-[0.5rem] font-bold text-red-400 uppercase">Fold</span>
              )}
              {player.isAllIn && (
                <span className="text-[0.5rem] font-bold text-purple-400 uppercase">All-In</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

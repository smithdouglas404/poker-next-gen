import { motion, AnimatePresence } from "framer-motion";
import { getHandStrength } from "@/lib/hand-evaluator";
import { CardType } from "@/lib/poker-types";

interface HandBadgeProps {
  holeCards?: [CardType, CardType];
  communityCards: CardType[];
  phase: string;
}

const PHASE_LABELS: Record<string, string> = {
  "pre-flop": "PRE-FLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
};

export function HandBadge({ holeCards, communityCards, phase }: HandBadgeProps) {
  if (!holeCards || phase === "showdown" || phase === "waiting") return null;

  const strength = getHandStrength(holeCards, communityCards);
  const phaseLabel = PHASE_LABELS[phase] || "";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${strength.label}-${phase}`}
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-0.5"
      >
        {/* Phase indicator */}
        {phaseLabel && (
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
            {phaseLabel}
          </span>
        )}

        {/* Hand name badge */}
        <div
          className="px-4 py-1.5 rounded-xl border backdrop-blur-md"
          style={{
            background: `linear-gradient(135deg, ${strength.color}18, ${strength.color}0a)`,
            borderColor: `${strength.color}35`,
            boxShadow: `0 0 16px ${strength.color}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          <span
            className="text-sm font-black tracking-wide uppercase"
            style={{ color: strength.color, textShadow: `0 0 8px ${strength.color}40` }}
          >
            {strength.label}
          </span>
        </div>

        {/* Strength bar */}
        <div className="w-20 h-1.5 rounded-full overflow-hidden bg-white/5 mt-0.5">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${strength.percentage}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ background: `linear-gradient(90deg, ${strength.color}80, ${strength.color})`, boxShadow: `0 0 6px ${strength.color}40` }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

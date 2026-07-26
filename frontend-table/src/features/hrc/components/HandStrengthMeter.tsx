import { motion, AnimatePresence } from "framer-motion";
import { getHandStrength } from "@/lib/hand-evaluator";
import { CardType } from "@/lib/poker-types";
import { TrendingUp } from "lucide-react";

interface HandStrengthMeterProps {
  holeCards?: [CardType, CardType];
  communityCards: CardType[];
  visible: boolean;
}

export function HandStrengthMeter({ holeCards, communityCards, visible }: HandStrengthMeterProps) {
  if (!holeCards || !visible) return null;

  const strength = getHandStrength(holeCards, communityCards);

  // Arc constants
  const radius = 36;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (circumference * strength.percentage) / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="fixed bottom-[120px] right-3 z-40 opacity-80 hover:opacity-100 transition-opacity"
      >
        <div className="glass rounded-xl p-3 space-y-2" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Label */}
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-gray-500" />
            <span className="text-[0.5625rem] text-gray-500 uppercase tracking-wider font-bold">Hand Strength</span>
          </div>

          {/* Semicircle gauge */}
          <div className="relative flex justify-center">
            <svg width="90" height="50" viewBox="0 0 90 50" className="overflow-visible">
              {/* Background arc */}
              <path
                d="M 5 45 A 36 36 0 0 1 85 45"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              {/* Strength arc */}
              <path
                d="M 5 45 A 36 36 0 0 1 85 45"
                fill="none"
                stroke={strength.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{
                  transition: "stroke-dashoffset 0.8s ease, stroke 0.5s ease",
                  filter: `drop-shadow(0 0 6px ${strength.color}60)`,
                }}
              />
            </svg>

            {/* Center percentage */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
              <motion.span
                key={strength.percentage}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-lg font-mono font-black block leading-none"
                style={{ color: strength.color, textShadow: `0 0 10px ${strength.color}40` }}
              >
                {strength.percentage}%
              </motion.span>
            </div>
          </div>

          {/* Hand label */}
          <motion.div
            key={strength.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <span className="text-[0.625rem] font-bold" style={{ color: strength.color }}>
              {strength.label}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./Card";
import { CardType } from "@/lib/poker-types";
import { useSoundEngine } from "@/lib/sound-context";
import { useState, useEffect, useRef } from "react";

interface CommunityCardsProps {
  cards: CardType[];
  pot: number;
}

export function CommunityCards({ cards, pot }: CommunityCardsProps) {
  const sound = useSoundEngine();
  const prevCardCount = useRef(0);
  const [burnCards, setBurnCards] = useState<number[]>([]);

  // Detect new cards being dealt and trigger phase reveal + burn card
  useEffect(() => {
    const newCount = cards.length;
    if (newCount > prevCardCount.current && prevCardCount.current >= 0) {
      const isNewPhase = newCount === 3 || newCount === 4 || newCount === 5;
      if (isNewPhase && prevCardCount.current < newCount) {
        sound.playPhaseReveal();
        // Show burn card
        const burnId = Date.now();
        setBurnCards(prev => [...prev, burnId]);
        setTimeout(() => {
          setBurnCards(prev => prev.filter(id => id !== burnId));
        }, 600);
      }
    }
    prevCardCount.current = newCount;
  }, [cards.length, sound]);

  return (
    <div className="flex flex-col items-center gap-3 relative">

      {/* Pot display */}
      <motion.div
        key={pot}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="relative"
      >
        <div
          className="rounded-full px-5 py-2 flex items-center gap-2.5"
          style={{
            background: "linear-gradient(135deg, rgba(10,15,25,0.9) 0%, rgba(5,10,18,0.95) 100%)",
            border: "1px solid rgba(212,175,55,0.2)",
            boxShadow: "0 0 20px rgba(212,175,55,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Chip stack icon */}
          <div className="relative w-5 h-5">
            <div className="absolute bottom-0 left-0 w-5 h-5 rounded-full" style={{ background: "linear-gradient(135deg, #ffd700, #d4af37)", boxShadow: "0 0 6px rgba(212,175,55,0.4)" }} />
            <div className="absolute bottom-[3px] left-0 w-5 h-5 rounded-full" style={{ background: "linear-gradient(135deg, #e74c3c, #c0392b)", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
            <div className="absolute bottom-[6px] left-0 w-5 h-5 rounded-full" style={{ background: "linear-gradient(135deg, #2ecc71, #27ae60)", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[0.625rem] uppercase tracking-[0.15em] text-amber-500/80 font-bold">POT</span>
            <span className="text-base font-mono font-black text-amber-300" style={{ textShadow: "0 0 8px rgba(212,175,55,0.4)" }}>
              {pot.toLocaleString()}
            </span>
            <span className="text-[0.5625rem] text-amber-600/60 uppercase tracking-wider font-medium">chips</span>
          </div>
          {/* Decorative arrow */}
          <div className="text-amber-500/40 text-xs ml-0.5">&#x2794;</div>
        </div>
      </motion.div>

      {/* Community cards container */}
      <div className="relative">
        {/* Holographic backdrop */}
        <div className="absolute -inset-3 rounded-2xl glass-light" />

        <div className="relative flex gap-2 p-2.5 rounded-xl">
          {/* Burn card animation */}
          <AnimatePresence>
            {burnCards.map((id) => (
              <motion.div
                key={`burn-${id}`}
                initial={{ opacity: 1, x: 0, scale: 1 }}
                animate={{ opacity: 0, x: -60, scale: 0.8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute -left-2 top-2.5 z-30"
              >
                <div
                  className="w-[52px] h-[74px] rounded-lg"
                  style={{
                    background: "linear-gradient(135deg, #1a1a2e, #16213e)",
                    border: "1.5px solid rgba(212,175,55,0.4)",
                    boxShadow: "0 0 12px rgba(255,165,0,0.3), 0 0 4px rgba(255,165,0,0.2)",
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="relative">
              <AnimatePresence mode="wait">
                {cards[i] ? (
                  <motion.div
                    key={`card-${i}-${cards[i].rank}-${cards[i].suit}`}
                    initial={{ opacity: 0, y: -20, rotateY: 90 }}
                    animate={{ opacity: 1, y: 0, rotateY: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 20,
                      delay: i * 0.3,
                    }}
                    onAnimationComplete={() => {
                      sound.playCardFlip();
                    }}
                  >
                    <Card card={cards[i]} size="md" />
                  </motion.div>
                ) : (
                  <div
                    className="w-[52px] h-[74px] rounded-lg border border-dashed flex items-center justify-center"
                    style={{
                      borderColor: "rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {/* Phase indicator dots */}
                    <div className="flex gap-0.5">
                      {i < 3 && <div className="w-1 h-1 rounded-full bg-[#d4af37]/30" />}
                      {i === 3 && <div className="w-1 h-1 rounded-full bg-[#d4af37]/20" />}
                      {i === 4 && <div className="w-1 h-1 rounded-full bg-[#d4af37]/20" />}
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Card Squeeze — touch-peel card reveal for mobile
import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Card } from "./Card";
import type { CardType } from "@/lib/poker-types";

interface CardSqueezeProps {
  cards: [CardType, CardType];
}

export function CardSqueeze({ cards }: CardSqueezeProps) {
  const [revealed, setRevealed] = useState(false);
  const [revealProgress, setRevealProgress] = useState(0); // 0 to 1
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const cardSizeRef = useRef<{ w: number; h: number }>({ w: 80, h: 112 });

  const handleTouchStart = useCallback((e: React.TouchEvent, cardIndex: number) => {
    if (revealed) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setActiveCard(cardIndex);
  }, [revealed]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || activeCard === null || revealed) return;
    e.preventDefault(); // prevent page scrolling while squeezing
    const touch = e.touches[0];
    const dx = touchStartRef.current.x - touch.clientX;
    const dy = touchStartRef.current.y - touch.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 120;
    const progress = Math.min(distance / maxDistance, 1);
    setRevealProgress(progress);
  }, [activeCard, revealed]);

  const handleTouchEnd = useCallback(() => {
    if (revealed) return;
    if (revealProgress > 0.5) {
      setRevealed(true);
      setRevealProgress(1);
    } else {
      setRevealProgress(0);
    }
    touchStartRef.current = null;
    setActiveCard(null);
  }, [revealProgress, revealed]);

  if (revealed) {
    return (
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="flex gap-3"
        style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))" }}
      >
        {cards.map((card, i) => (
          <Card
            key={`hero-squeeze-${i}`}
            card={{ ...card, hidden: false }}
            size="xl"
            isHero={true}
            delay={0}
          />
        ))}
      </motion.div>
    );
  }

  return (
    <div
      className="flex gap-3"
      style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))" }}
    >
      {cards.map((card, i) => {
        const isActive = activeCard === i;
        const progress = isActive ? revealProgress : 0;
        const bendAngle = progress * 15;

        return (
          <div
            key={`squeeze-${i}`}
            className="relative touch-none select-none"
            onTouchStart={(e) => handleTouchStart(e, i)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: 80,
              height: 112,
              perspective: "400px",
            }}
          >
            {/* Face-down card back */}
            <div
              className="absolute inset-0 rounded-lg overflow-hidden"
              style={{
                transform: `rotateY(${bendAngle}deg)`,
                transformOrigin: "left center",
                transition: isActive ? "none" : "transform 0.3s ease-out",
              }}
            >
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(145deg, #1a1040 0%, #0d0820 40%, #1a0a30 70%, #0a0618 100%)",
                  border: "2px solid rgba(212,175,55,0.4)",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.6), 0 0 2px rgba(212,175,55,0.3)",
                }}
              >
                <div
                  className="w-6 h-6 rounded-full border border-amber-600/30"
                  style={{
                    background: "radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)",
                  }}
                />
              </div>
            </div>

            {/* Progressive card reveal via clip-path */}
            <div
              className="absolute inset-0 rounded-lg overflow-hidden"
              style={{
                clipPath: `polygon(${100 - progress * 100}% 100%, 100% 100%, 100% ${100 - progress * 100}%, ${100 - progress * 100}% ${100 - progress * 100}%)`,
                transition: isActive ? "none" : "clip-path 0.3s ease-out",
              }}
            >
              <Card
                card={{ ...card, hidden: false }}
                size="lg"
                isHero={true}
                delay={0}
              />
            </div>

            {/* Drag hint */}
            {progress === 0 && (
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M6 2L2 6M6 2L6 6M6 2L2 2" stroke="white" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

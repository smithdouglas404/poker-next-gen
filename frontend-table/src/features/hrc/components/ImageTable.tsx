import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./Card";
import type { CardType } from "@/lib/poker-types";
import type { Player } from "@/lib/poker-types";
import { TABLE_SEATS, DEALER_POSITIONS } from "@/lib/table-constants";
import { useGameUI } from "@/lib/game-ui-context";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";


interface ImageTableProps {
  communityCards: CardType[];
  pot: number;
  playerCount: number;
  maxSeats?: number;
  players?: Player[];
  dealerSeatIndex?: number;
  /** Number of community cards to visually show (from dealing sequence) */
  visibleCommunityCards?: number;
  /** Whether visible community cards have flipped face-up */
  communityFlipped?: boolean;
  /** Show burn card visual before dealing */
  showBurnCard?: boolean;
  /** Current deal phase — triggers flash on change */
  dealPhase?: string;
  /** Hand number for display */
  handNumber?: number;
  /** Blind levels for display */
  blinds?: { small: number; big: number };
}

// Premium chip denomination config
interface ChipDenom {
  color: string;       // Main chip color
  border: string;      // Edge color
  stripe: string;      // Edge stripe color (casino chip stripes)
  inner: string;       // Inner circle color
  count: number;
}

function getPotChipStacks(pot: number): ChipDenom[] {
  const stacks: ChipDenom[] = [];
  let remaining = pot;

  if (remaining >= 500) {
    const count = Math.min(7, Math.floor(remaining / 500));
    stacks.push({ color: "#ffd700", border: "#b8860b", stripe: "#ffffff", inner: "#f59e0b", count });
    remaining -= count * 500;
  }
  if (remaining >= 100) {
    const count = Math.min(7, Math.floor(remaining / 100));
    stacks.push({ color: "#111827", border: "#374151", stripe: "#f8fafc", inner: "#1f2937", count });
    remaining -= count * 100;
  }
  if (remaining >= 50) {
    const count = Math.min(7, Math.floor(remaining / 50));
    stacks.push({ color: "#dc2626", border: "#991b1b", stripe: "#fecaca", inner: "#b91c1c", count });
    remaining -= count * 50;
  }
  if (remaining > 0) {
    const count = Math.min(7, Math.max(1, Math.floor(remaining / 10)));
    stacks.push({ color: "#16a34a", border: "#166534", stripe: "#bbf7d0", inner: "#15803d", count });
  }

  return stacks.slice(0, 3);
}

// Premium casino chip SVG with edge stripes
function PotChip({ chip, index }: { chip: ChipDenom; index: number }) {
  return (
    <svg
      width="32" height="32" viewBox="0 0 32 32" fill="none"
      style={{
        marginBottom: index > 0 ? -29 : 0,
        transform: "rotateX(55deg)",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
      }}
    >
      {/* Main chip body */}
      <circle cx="16" cy="16" r="15" fill={chip.color} stroke={chip.border} strokeWidth="1.5" />
      {/* Edge stripes (8 evenly spaced) */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 16 + Math.cos(rad) * 12;
        const y1 = 16 + Math.sin(rad) * 12;
        const x2 = 16 + Math.cos(rad) * 15;
        const y2 = 16 + Math.sin(rad) * 15;
        return (
          <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={chip.stripe} strokeWidth="2.5" strokeLinecap="round" opacity="0.6"
          />
        );
      })}
      {/* Inner decorative ring */}
      <circle cx="16" cy="16" r="9" fill="none" stroke={chip.stripe} strokeWidth="0.8" opacity="0.3" />
      {/* Inner circle */}
      <circle cx="16" cy="16" r="6.5" fill={chip.inner} opacity="0.4" />
      {/* Center dot */}
      <circle cx="16" cy="16" r="2" fill={chip.stripe} opacity="0.25" />
      {/* Top highlight */}
      <ellipse cx="13" cy="10" rx="6" ry="4" fill="white" opacity="0.1" />
    </svg>
  );
}

export function ImageTable({
  communityCards,
  pot,
  playerCount,
  maxSeats = 10,
  players,
  dealerSeatIndex = -1,
  visibleCommunityCards,
  communityFlipped = true,
  showBurnCard = false,
  dealPhase,
  handNumber,
  blinds,
}: ImageTableProps) {
  const { compactMode, feltPreset } = useGameUI();
  const occupiedCount = players?.length || playerCount;
  const dealerPos = dealerSeatIndex >= 0 && dealerSeatIndex < DEALER_POSITIONS.length
    ? DEALER_POSITIONS[dealerSeatIndex]
    : null;

  // Animated pot counter — smooth count-up/down when pot changes
  const { value: animatedPot, animating: potAnimating, delta: potDelta } = useAnimatedCounter(pot, 500);

  // Pot container ref — exposed via window so chip animations can target it
  const potRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (window as any).__potRef = potRef;
    return () => { delete (window as any).__potRef; };
  }, []);

  // Phase flash effect
  const [showFlash, setShowFlash] = useState(false);
  const prevPhaseRef = useRef(dealPhase);
  useEffect(() => {
    if (dealPhase && dealPhase !== prevPhaseRef.current && !compactMode) {
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 500);
      prevPhaseRef.current = dealPhase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = dealPhase;
  }, [dealPhase, compactMode]);

  // Previous dealer seat for spin animation
  const prevDealerRef = useRef(dealerSeatIndex);
  const dealerChanged = dealerSeatIndex !== prevDealerRef.current;
  useEffect(() => { prevDealerRef.current = dealerSeatIndex; }, [dealerSeatIndex]);

  return (
    <>
      {/* ══ Poker Table — image-based (GGPoker-style) ══ */}
      <div className="absolute z-[1]" style={{
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "97%",
        aspectRatio: "1408 / 768",
        maxHeight: "92%",
      }}>
        <img
          src="/images/poker-table-felt.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
          draggable={false}
          style={{
            filter: "drop-shadow(0 12px 50px rgba(0,0,0,0.8)) drop-shadow(0 0 80px rgba(0,0,0,0.4))",
          }}
        />
      </div>

      {/* ── Game elements overlay — matches table image position exactly ── */}
      <div className="absolute pointer-events-none" style={{
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "97%",
        aspectRatio: "1408 / 768",
        maxHeight: "92%",
        zIndex: 10,
      }}>

        {/* Seat slots — rendered as HTML squares (never misalign on resize) */}
        {Array.from({ length: maxSeats }).map((_, i) => {
          const seat = TABLE_SEATS[i];
          if (!seat) return null;
          const isOccupied = i < occupiedCount;
          // Empty seats are clickable
          if (!isOccupied) {
            const s = seat.scale;
            return (
              <div
                key={`empty-${i}`}
                className="absolute pointer-events-auto cursor-pointer group"
                style={{
                  left: `${seat.x}%`,
                  top: `${seat.y}%`,
                  transform: `translate(-50%, -50%) scale(${s})`,
                }}
              >
                <div
                  className="w-[44px] h-[44px] rounded-full border border-dashed flex items-center justify-center transition-all group-hover:border-amber-400/50 group-hover:scale-115"
                  style={{
                    borderColor: "rgba(212,175,55,0.18)",
                    background: "rgba(212,175,55,0.03)",
                  }}
                >
                  <span className="text-[0.625rem] text-amber-400/30 font-bold group-hover:text-amber-400/60 transition-colors">+</span>
                </div>
              </div>
            );
          }
          return null; // Occupied seats rendered by Seat component
        })}

        {/* ── Burn card visual ── */}
        <AnimatePresence>
          {showBurnCard && !compactMode && (
            <motion.div
              initial={{ opacity: 0, x: 80, y: -40, scale: 0.5 }}
              animate={{ opacity: 0.8, x: 0, y: 0, scale: 0.7 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={{ duration: 0.25 }}
              className="absolute"
              style={{
                left: "42%",
                top: "32%",
                transform: "translate(-50%, -50%) rotate(-5deg)",
                zIndex: 11,
              }}
            >
              <div className="w-[50px] h-[70px] rounded-md overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #1e3a5f, #0d1b2a)",
                  border: "2px solid rgba(212,175,55,0.3)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
                }}
              >
                <div className="w-full h-full" style={{ background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(212,175,55,0.08) 4px, rgba(212,175,55,0.08) 8px)" }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Community cards glow backdrop ── */}
        {communityCards.length > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: "50%",
              top: "44%",
              transform: "translate(-50%, -50%)",
              width: "420px",
              height: "180px",
              background: "radial-gradient(ellipse at center, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 40%, transparent 70%)",
              zIndex: 9,
            }}
          />
        )}

        {/* ── Community cards — large, center of felt ── */}
        <AnimatePresence>
          {(() => {
            const count = visibleCommunityCards !== undefined
              ? Math.min(visibleCommunityCards, communityCards.length)
              : communityCards.length;
            if (count <= 0) return null;
            const cardsToShow = communityCards.slice(0, count);
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute flex gap-2.5"
                style={{
                  left: "50%",
                  top: "44%",
                  transform: "translate(-50%, -50%)",
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.7))",
                }}
              >
                {cardsToShow.map((card, i) => (
                  <Card
                    key={`cc-${i}-${card.suit}-${card.rank}`}
                    card={card}
                    size={compactMode ? "lg" : (window.innerWidth < 1440 ? "xl" : "2xl")}
                    delay={compactMode ? 0 : i * 0.12}
                    dealFrom={compactMode ? undefined : { x: 200, y: -100 }}
                    faceDown={!communityFlipped && !compactMode}
                    flipDelay={compactMode ? 0 : 0.15 * i}
                  />
                ))}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* ── Pot display (Stitch style — gold glass pill) ── */}
        <AnimatePresence>
          {pot > 0 && (
            <motion.div
              ref={potRef}
              initial={compactMode ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={compactMode ? { duration: 0 } : undefined}
              className="absolute flex flex-col items-center gap-1"
              style={{ left: "50%", top: "33%", transform: "translate(-50%, -50%)" }}
            >
              {/* Phase label */}
              {dealPhase && (
                <span
                  className="text-[0.625rem] font-black uppercase tracking-[0.15em] text-[#d4af37]"
                  style={{ textShadow: "0 0 10px rgba(212,175,55,0.4)" }}
                >
                  {dealPhase === "pre-flop" ? "Pre-Flop" : dealPhase === "flop" ? "Flop" : dealPhase === "turn" ? "Turn" : dealPhase === "river" ? "River" : ""}
                </span>
              )}

              {/* 3D chip stacks + pot pill */}
              <div className="flex items-center gap-2.5">
                {!compactMode && (
                  <motion.div
                    initial={{ scale: 0.7 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex items-end gap-1"
                    style={{ perspective: "120px" }}
                  >
                    {getPotChipStacks(animatedPot).map((stack, si) => (
                      <div key={si} className="flex flex-col-reverse items-center">
                        {Array.from({ length: stack.count }).map((_, ci) => (
                          <PotChip key={ci} chip={stack} index={ci} />
                        ))}
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* Pot amount pill — glass with gold accent */}
                <motion.div
                  animate={potAnimating && !compactMode ? {
                    boxShadow: [
                      "0 0 15px rgba(212,175,55,0.15), inset 0 0 12px rgba(212,175,55,0.05)",
                      "0 0 30px rgba(212,175,55,0.4), inset 0 0 18px rgba(212,175,55,0.10)",
                      "0 0 15px rgba(212,175,55,0.15), inset 0 0 12px rgba(212,175,55,0.05)",
                    ],
                    scale: [1, 1.06, 1],
                  } : {
                    boxShadow: "0 0 15px rgba(212,175,55,0.15), inset 0 0 12px rgba(212,175,55,0.05)",
                    scale: 1,
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full backdrop-blur-md"
                  style={{
                    background: "linear-gradient(135deg, rgba(15,15,20,0.80) 0%, rgba(30,25,15,0.75) 100%)",
                    border: "1px solid rgba(212,175,55,0.35)",
                  }}
                >
                  {/* Coin icon */}
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                    <circle cx="10" cy="10" r="9" fill="#d4af37" stroke="#b8860b" strokeWidth="1.5" />
                    <circle cx="10" cy="10" r="5.5" fill="none" stroke="#f5e6a3" strokeWidth="0.8" opacity="0.5" />
                    <text x="10" y="13.5" textAnchor="middle" fill="#8B6914" fontSize="9" fontWeight="bold">$</text>
                  </svg>
                  <span
                    className="font-display font-black text-sm tracking-wide"
                    style={{
                      background: "linear-gradient(180deg, #f5e6a3 0%, #d4af37 60%, #c9a84c 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      filter: "drop-shadow(0 0 6px rgba(212,175,55,0.4))",
                    }}
                  >
                    {animatedPot.toLocaleString()}
                  </span>
                </motion.div>
              </div>

              {/* Floating delta indicator */}
              <AnimatePresence>
                {potAnimating && potDelta > 0 && !compactMode && (
                  <motion.span
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -20 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="absolute -top-4 right-0 text-xs font-mono font-bold text-green-400"
                    style={{ textShadow: "0 0 8px rgba(34,197,94,0.5)" }}
                  >
                    +${potDelta.toLocaleString()}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Dealer button — metallic with spin ── */}
        <AnimatePresence>
          {dealerPos && (
            <motion.div
              key="dealer-btn"
              initial={false}
              animate={{
                left: `${dealerPos.x}%`,
                top: `${dealerPos.y}%`,
                opacity: 1,
                scale: [1, 1.18, 1],
                rotate: dealerChanged && !compactMode ? [0, 360] : 0,
              }}
              transition={compactMode ? { duration: 0 } : {
                type: "spring", stiffness: 200, damping: 25,
                scale: { duration: 0.4, ease: "easeOut" },
                rotate: { duration: 0.6, ease: "easeInOut" },
              }}
              className="absolute"
              style={{ transform: "translate(-50%, -50%)", zIndex: 15 }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-gray-900"
                data-testid="dealer-button"
                style={{
                  background: "white",
                  border: "2.5px solid #d4af37",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.5), 0 0 12px rgba(212,175,55,0.3)",
                }}
              >
                D
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase transition flash overlay ── */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0.08) 40%, transparent 70%)",
                zIndex: 20,
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Hand/Blind info strip — bottom of felt ── */}
        {(handNumber || blinds) && (
          <div className="absolute pointer-events-none" style={{
            left: "50%", bottom: "6%",
            transform: "translateX(-50%)",
            zIndex: 5,
            display: "flex", gap: "12px", alignItems: "center",
            padding: "2px 12px",
            borderRadius: "10px",
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(212,175,55,0.12)",
            fontSize: "0.625rem",
            fontFamily: "var(--font-mono, monospace)",
            color: "rgba(212,175,55,0.6)",
            letterSpacing: "0.05em",
          }}>
            {handNumber && <span>Hand #{handNumber}</span>}
            {blinds && <span>${blinds.small}/${blinds.big}</span>}
          </div>
        )}
      </div>
    </>
  );
}

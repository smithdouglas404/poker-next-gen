import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { useGameUI } from "@/lib/game-ui-context";
import { TABLE_SEATS, DEALER_POSITIONS } from "@/lib/table-constants";
import { Card } from "./Card";
import type { CardType } from "@/lib/poker-types";
import type { Player } from "@/lib/poker-types";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   CSS variables from the user's exact design
   ═══════════════════════════════════════════════════════════════ */
const V = {
  bg1: "#071222",
  bg2: "#0d1f39",
  cyan: "#58f1ff",
  cyanSoft: "rgba(88, 241, 255, 0.35)",
  cyanLine: "rgba(88, 241, 255, 0.7)",
  gold: "#f2c660",
  gold2: "#c9942e",
  greenFelt1: "#145f3c",
  greenFelt2: "#0d452d",
  panel: "rgba(23, 34, 51, 0.78)",
  panel2: "rgba(17, 26, 40, 0.92)",
  white: "#f5f8ff",
  textDim: "#b3d3df",
  danger: "#ff6e72",
  success: "#5cff7d",
  shadowCyan: "0 0 10px rgba(88, 241, 255, 0.65), 0 0 25px rgba(88, 241, 255, 0.18)",
  shadowGold: "0 0 10px rgba(242, 198, 96, 0.45), 0 0 24px rgba(242, 198, 96, 0.16)",
};

/* Shared panel style from user's design */
const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(47,60,79,0.88), rgba(23,30,44,0.94))",
  backdropFilter: "blur(8px)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 22px rgba(0,0,0,.28)",
};

interface CSSPokerTableProps {
  communityCards: CardType[];
  pot: number;
  playerCount: number;
  maxSeats?: number;
  players?: Player[];
  dealerSeatIndex?: number;
  visibleCommunityCards?: number;
  communityFlipped?: boolean;
  showBurnCard?: boolean;
  dealPhase?: string;
  actionLog?: string[];
}

export function CSSPokerTable({
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
  actionLog,
}: CSSPokerTableProps) {
  const { compactMode } = useGameUI();
  const occupiedCount = players?.length || playerCount;
  const dealerPos = dealerSeatIndex >= 0 && dealerSeatIndex < DEALER_POSITIONS.length
    ? DEALER_POSITIONS[dealerSeatIndex]
    : null;

  const { value: animatedPot, animating: potAnimating, delta: potDelta } = useAnimatedCounter(pot, 500);

  const potRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (window as any).__potRef = potRef;
    return () => { delete (window as any).__potRef; };
  }, []);

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

  const prevDealerRef = useRef(dealerSeatIndex);
  const dealerChanged = dealerSeatIndex !== prevDealerRef.current;
  useEffect(() => { prevDealerRef.current = dealerSeatIndex; }, [dealerSeatIndex]);

  return (
    <>
      {/* ═══ The Table — GGPoker-style elliptical felt with premium rail ═══ */}
      <div className="absolute z-[1]" style={{
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "80%",
        height: "65%",
      }}>
        {/* Outer padded rail — dark leather look */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 40%, #1a1e28 0%, #12151c 40%, #0a0d14 100%)`,
          boxShadow: `0 0 0 3px rgba(180,155,100,0.35), 0 0 0 5px rgba(10,12,18,0.95), 0 0 0 8px rgba(212,175,55,0.45), 0 0 0 10px rgba(180,150,80,0.15), 0 0 50px rgba(0,0,0,0.6), 0 0 100px rgba(0,0,0,0.3), inset 0 0 80px rgba(0,0,0,0.5)`,
        }}>
          {/* Inner gold trim ring — separates rail from felt */}
          <div style={{
            position: "absolute",
            inset: "6.5%",
            borderRadius: "50%",
            border: "2px solid rgba(212,175,55,0.5)",
            boxShadow: "0 0 8px rgba(212,175,55,0.15), inset 0 0 8px rgba(212,175,55,0.08)",
            pointerEvents: "none",
          }} />

          {/* Felt surface — rich dark green */}
          <div style={{
            position: "absolute",
            inset: "7.5%",
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 50% 42%, #1a7a4e 0%, ${V.greenFelt1} 35%, ${V.greenFelt2} 72%, #092e1e 100%)`,
            boxShadow: `inset 0 0 80px rgba(0,0,0,0.4), inset 0 0 160px rgba(0,0,0,0.15)`,
          }}>
            {/* Overhead light reflection on felt — warm, subtle */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(ellipse 60% 40% at 50% 35%, rgba(255,255,240,0.07) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />

            {/* Subtle felt texture — fine noise effect */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
              backgroundSize: "200px 200px",
              opacity: 0.5,
              mixBlendMode: "overlay" as const,
              pointerEvents: "none",
            }} />

            {/* Inner decorative line — subtle gold, not cyan */}
            <div style={{
              position: "absolute",
              inset: "8%",
              borderRadius: "50%",
              border: "1px solid rgba(212,175,55,0.18)",
              pointerEvents: "none",
            }} />

            {/* Watermark */}
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 2 }}>
              <span style={{
                color: "rgba(212,175,55,0.04)",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: "clamp(0.7rem, 2cqmin, 1.4rem)",
                letterSpacing: "0.35em",
                textTransform: "uppercase" as const,
                userSelect: "none" as const,
                pointerEvents: "none" as const,
              }}>
                HIGH ROLLERS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Game elements overlay ═══ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>

        {/* Empty seat slots — scaled per seat position */}
        {Array.from({ length: maxSeats }).map((_, i) => {
          const seat = TABLE_SEATS[i];
          if (!seat) return null;
          if (i < occupiedCount) return null;
          const s = seat.scale;
          return (
            <div
              key={`empty-${i}`}
              className="absolute pointer-events-auto cursor-pointer group"
              style={{ left: `${seat.x}%`, top: `${seat.y}%`, transform: `translate(-50%, -50%) scale(${s})` }}
            >
              <div
                className="w-[68px] h-[68px] rounded-[18px] border-2 border-dashed flex flex-col items-center justify-center transition-all group-hover:scale-110"
                style={{
                  borderColor: "rgba(212,175,55,0.35)",
                  background: "rgba(212,175,55,0.04)",
                  boxShadow: "0 0 8px rgba(212,175,55,0.08)",
                }}
              >
                <span style={{ color: "rgba(212,175,55,0.45)", fontSize: "0.625rem", fontFamily: "monospace", fontWeight: 700 }}>#{i + 1}</span>
                <span style={{ color: "rgba(212,175,55,0.25)", fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }} className="group-hover:!text-amber-400/70 transition-colors">SIT</span>
              </div>
            </div>
          );
        })}

        {/* Community card zone — subtle recessed area on felt (GGPoker-style) */}
        <div className="absolute pointer-events-none" style={{
          left: "50%", top: "47%",
          transform: "translate(-50%, -50%)",
          width: "clamp(300px, 42%, 620px)",
          height: "clamp(80px, 12%, 170px)",
          borderRadius: "40px",
          background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 60%, transparent 100%)",
          boxShadow: "inset 0 2px 12px rgba(0,0,0,0.15), inset 0 0 30px rgba(0,0,0,0.06)",
          zIndex: 2,
        }} />

        {/* Community cards */}
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
                className="absolute flex gap-2"
                style={{
                  left: "50%", top: "47%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 3,
                }}
              >
                {cardsToShow.map((card, i) => (
                  <Card
                    key={`cc-${i}-${card.suit}-${card.rank}`}
                    card={card}
                    size={compactMode ? "lg" : "2xl"}
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

        {/* Pot display */}
        <AnimatePresence>
          {pot > 0 && (
            <motion.div
              ref={potRef}
              initial={compactMode ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={compactMode ? { duration: 0 } : undefined}
              className="absolute flex flex-col items-center gap-1"
              style={{ left: "50%", top: "30%", transform: "translate(-50%, -50%)" }}
            >
              {dealPhase && (
                <span style={{
                  fontSize: "0.625rem", fontWeight: 900, textTransform: "uppercase",
                  letterSpacing: "0.15em", color: V.gold,
                  textShadow: `0 0 10px rgba(212,175,55,0.4)`,
                }}>
                  {dealPhase === "pre-flop" ? "Pre-Flop" : dealPhase === "flop" ? "Flop" : dealPhase === "turn" ? "Turn" : dealPhase === "river" ? "River" : ""}
                </span>
              )}

              <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full" style={{
                ...panelStyle,
                borderRadius: "9999px",
              }}>
                <span style={{
                  color: V.gold, fontWeight: 900, fontSize: "0.875rem",
                  fontFamily: "var(--font-display)",
                  textShadow: `0 0 8px rgba(242,198,96,0.4)`,
                }}>
                  Pot: {animatedPot.toLocaleString()}
                </span>
              </div>

              <AnimatePresence>
                {potAnimating && potDelta > 0 && !compactMode && (
                  <motion.span
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -20 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{ position: "absolute", top: -16, right: 0, fontSize: "0.75rem", fontFamily: "monospace", fontWeight: 700, color: V.success, textShadow: `0 0 8px rgba(92,255,125,0.5)` }}
                  >
                    +${potDelta.toLocaleString()}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dealer button */}
        <AnimatePresence>
          {dealerPos && (
            <motion.div
              key="dealer-btn"
              initial={false}
              animate={{
                left: `${dealerPos.x}%`, top: `${dealerPos.y}%`,
                opacity: 1, scale: [1, 1.18, 1],
                rotate: dealerChanged && !compactMode ? [0, 360] : 0,
              }}
              transition={compactMode ? { duration: 0 } : {
                type: "spring", stiffness: 200, damping: 25,
                scale: { duration: 0.4 }, rotate: { duration: 0.6 },
              }}
              className="absolute"
              style={{ transform: "translate(-50%, -50%)", zIndex: 15 }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: "0.75rem", color: "#111",
                background: "white", border: `2.5px solid ${V.gold}`,
                boxShadow: V.shadowGold,
              }}>
                D
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase flash */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at center, rgba(212,175,55,0.12) 0%, transparent 60%)`, zIndex: 20 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ═══ Hand History Log Panel — user's exact design ═══ */}
      {actionLog && actionLog.length > 0 && (
        <div className="absolute z-[15]" style={{
          top: "15%", left: "2%", width: "196px",
          borderRadius: "18px", padding: "16px 16px 18px",
          ...panelStyle,
        }}>
          <h3 style={{
            margin: "0 0 8px", fontSize: "14px", letterSpacing: "0.04em",
            color: V.gold, textTransform: "uppercase", fontWeight: 700,
          }}>
            Hand Log
          </h3>
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {actionLog.map((entry, i) => {
              const isPhase = entry.startsWith("---") || entry.includes("FLOP") || entry.includes("TURN") || entry.includes("RIVER") || entry.includes("Hand #");
              const isWinner = entry.includes("wins") || entry.includes("🏆");
              return (
                <div key={i} style={{
                  position: "relative", paddingLeft: 18, marginBottom: 8,
                  fontSize: "0.6875rem", lineHeight: 1.42,
                  color: isWinner ? V.gold : isPhase ? V.gold : "#eff8ff",
                  fontWeight: isPhase || isWinner ? 700 : 400,
                }}>
                  {/* Step dot */}
                  <div style={{
                    position: "absolute", left: 0, top: 4,
                    width: 8, height: 8, borderRadius: "50%",
                    background: isWinner ? V.gold : isPhase ? `rgba(212,175,55,0.8)` : "rgba(212,175,55,0.4)",
                    boxShadow: isPhase ? "0 0 0 4px rgba(212,175,55,0.16)" : undefined,
                  }} />
                  {/* Connector line */}
                  {i < actionLog.length - 1 && (
                    <div style={{
                      position: "absolute", left: 3, top: 14,
                      width: 2, height: "calc(100% + 0px)",
                      background: "rgba(212,185,120,0.18)",
                    }} />
                  )}
                  {entry}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

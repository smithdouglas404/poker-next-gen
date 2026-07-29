"use client";

// Hero's own hole cards, shown face-up, tilted, bottom-center above the action
// dock — the seat layer (Seat.tsx) deliberately skips the hero's own cards
// (a player doesn't see their cards floating on their own avatar), so this is
// a separate overlay fed the same hero cards HrcTable already threads through
// for the adapter (`heroCards` -> adapted hero Player.cards).

import type { CardType } from "@/features/hrc/lib/poker-types";
import { Card } from "./Card";
import { evaluateHandForVariant } from "@/features/hrc/lib/hand-evaluator";

// cards.length is 2 for Hold'em, 4 for PLO — the backend always deals
// exactly one or the other (backend-core/poker/table.go holeCount()), so
// this renders however many were actually dealt rather than hardcoding 2
// (a 4-card PLO hand used to have its last 2 cards silently dropped here).
export function HeroHoleCards({
  cards,
  communityCards,
}: {
  cards?: CardType[];
  communityCards: CardType[];
}) {
  if (!cards || cards.length === 0) return null;
  const hand = evaluateHandForVariant(cards, communityCards);
  // Fan the cards evenly around center; 2 cards keep the original ±8deg tilt,
  // 4 cards (PLO) spread a bit wider so they don't overlap illegibly.
  const spread = cards.length <= 2 ? 8 : 12;
  const overlap = cards.length <= 2 ? -25 : -30;

  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      style={{ position: "fixed", left: "50%", bottom: 215, transform: "translateX(-50%)", zIndex: 45 }}
    >
      <div
        className="mb-1.5 rounded-full px-3 py-1 font-display text-xs font-black uppercase tracking-[0.15em]"
        style={{
          color: "#ffd700",
          background: "rgba(10,10,12,0.85)",
          border: "1px solid rgba(212,175,55,0.4)",
          textShadow: "0 0 10px rgba(212,175,55,0.5)",
          boxShadow: "0 0 16px rgba(212,175,55,0.25)",
        }}
      >
        {hand.description}
      </div>
      {/* Scaled down slightly from the "lg" preset (90x135) rather than
          jumping to "md" (70x105, a ~22% drop) — a smaller, deliberate nudge. */}
      <div className="flex" style={{ transform: "scale(0.88)", transformOrigin: "top center" }}>
        {cards.map((card, i) => {
          const angle = cards.length === 1 ? 0 : -spread + (i * (2 * spread)) / (cards.length - 1);
          return (
            <div
              key={i}
              style={{ transform: `rotate(${angle}deg)`, zIndex: i + 1, marginLeft: i === 0 ? 0 : overlap }}
            >
              <Card card={card} size="lg" isHero />
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

// Hero's own hole cards, shown face-up, tilted, bottom-center above the action
// dock — the seat layer (Seat.tsx) deliberately skips the hero's own cards
// (a player doesn't see their cards floating on their own avatar), so this is
// a separate overlay fed the same hero cards HrcTable already threads through
// for the adapter (`heroCards` -> adapted hero Player.cards).

import type { CardType } from "@/features/hrc/lib/poker-types";
import { Card } from "./Card";
import { evaluateHand } from "@/features/hrc/lib/hand-evaluator";

export function HeroHoleCards({
  cards,
  communityCards,
}: {
  cards?: [CardType, CardType];
  communityCards: CardType[];
}) {
  if (!cards) return null;
  const hand = evaluateHand(cards, communityCards);

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
        <div style={{ transform: "rotate(-8deg) translateX(10px)", zIndex: 1 }}>
          <Card card={cards[0]} size="lg" isHero />
        </div>
        <div style={{ transform: "rotate(8deg) translateX(-10px)", zIndex: 2, marginLeft: -25 }}>
          <Card card={cards[1]} size="lg" isHero />
        </div>
      </div>
    </div>
  );
}

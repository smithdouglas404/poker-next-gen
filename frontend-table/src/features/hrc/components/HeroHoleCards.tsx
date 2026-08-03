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
      {/* mb-3, not mb-1.5: each card is rotated about its own centre, which
          lifts the outer top corner of the fanned cards above the unrotated
          card top by roughly (width/2)·sin(spread). The old 6px gap was
          smaller than that lift, so the fan rode up over this label and hid
          the hand the player actually holds. */}
      <div
        className="mb-3 rounded-full px-3 py-1 font-display text-xs font-black uppercase tracking-[0.15em]"
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
      {/* Scaled off the "lg" preset (90x135) rather than switching size tokens,
          so the card art keeps its 2:3 ratio and gold hero border weight. At
          0.88 the fan was large enough to sit over the hand-strength label and
          crowd the board; 0.72 gives ~65x97 — clearly the player's own cards,
          without owning the bottom third of the felt. */}
      <div className="flex" style={{ transform: "scale(0.72)", transformOrigin: "top center" }}>
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

import { PlayingCard3D } from "./PlayingCard3D";
import { useGameStore } from "@/features/hrc/store/useGameStore";

/**
 * Blueprint Section 5 — BoardCardsGroup
 * Flop / turn / river positions on felt.
 * Physically grounded spacing, animated entrance (Phase 8).
 * Reads board cards from Zustand game store.
 */

// 5 card positions centered on the felt, evenly spaced
const CARD_POSITIONS: [number, number, number][] = [
  [-0.40, 0.085, 0],    // flop 1
  [-0.20, 0.085, 0],    // flop 2
  [0.00, 0.085, 0],     // flop 3
  [0.22, 0.085, 0],     // turn
  [0.44, 0.085, 0],     // river
];

export function BoardCardsGroup() {
  const boardCards = useGameStore((s) => s.boardCards);

  return (
    <group>
      {boardCards.map((card, i) => {
        if (i >= CARD_POSITIONS.length) return null;
        const pos = CARD_POSITIONS[i];
        return (
          <PlayingCard3D
            key={`board-${i}`}
            rank={card.rank}
            suit={card.suit}
            faceUp={!card.hidden}
            position={pos}
          />
        );
      })}
    </group>
  );
}

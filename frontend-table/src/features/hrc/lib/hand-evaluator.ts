import { CardType, Suit, Rank } from './poker-types';

// Hand rankings from lowest to highest
export type HandRank =
  | 'High Card'
  | 'Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

export interface EvaluatedHand {
  rank: HandRank;
  rankValue: number;      // 0-9 for comparison
  kickers: number[];      // tie-breaking values
  bestCards: CardType[];   // the 5 cards that make the hand
  description: string;    // e.g. "Pair of Aces, King kicker"
}

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const HAND_RANK_VALUES: Record<HandRank, number> = {
  'High Card': 0,
  'Pair': 1,
  'Two Pair': 2,
  'Three of a Kind': 3,
  'Straight': 4,
  'Flush': 5,
  'Full House': 6,
  'Four of a Kind': 7,
  'Straight Flush': 8,
  'Royal Flush': 9,
};

const RANK_NAMES: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes',
  7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

const RANK_SINGULAR: Record<number, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six',
  7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

function cardValue(card: CardType): number {
  return RANK_VALUES[card.rank];
}

// Generate all 5-card combinations from 7 cards
function combinations(cards: CardType[], k: number): CardType[][] {
  if (k === 0) return [[]];
  if (cards.length === 0) return [];
  const [first, ...rest] = cards;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(cards: CardType[]): EvaluatedHand {
  const sorted = [...cards].sort((a, b) => cardValue(b) - cardValue(a));
  const values = sorted.map(cardValue);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check for straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  const uniqueVals = Array.from(new Set(values)).sort((a, b) => b - a);
  if (uniqueVals.length >= 5) {
    for (let i = 0; i <= uniqueVals.length - 5; i++) {
      if (uniqueVals[i] - uniqueVals[i + 4] === 4) {
        isStraight = true;
        straightHigh = uniqueVals[i];
        break;
      }
    }
    // Ace-low straight (A-2-3-4-5)
    if (!isStraight && uniqueVals.includes(14) && uniqueVals.includes(2) &&
        uniqueVals.includes(3) && uniqueVals.includes(4) && uniqueVals.includes(5)) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count ranks
  const counts: Record<number, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  const groups = Object.entries(counts)
    .map(([val, count]) => ({ val: parseInt(val), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  // Determine hand
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { rank: 'Royal Flush', rankValue: 9, kickers: [14], bestCards: sorted, description: 'Royal Flush!' };
    }
    return {
      rank: 'Straight Flush', rankValue: 8, kickers: [straightHigh],
      bestCards: sorted, description: `Straight Flush, ${RANK_SINGULAR[straightHigh]} high`
    };
  }

  if (groups[0].count === 4) {
    const quad = groups[0].val;
    const kicker = groups[1].val;
    return {
      rank: 'Four of a Kind', rankValue: 7, kickers: [quad, kicker],
      bestCards: sorted, description: `Four ${RANK_NAMES[quad]}`
    };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      rank: 'Full House', rankValue: 6, kickers: [groups[0].val, groups[1].val],
      bestCards: sorted, description: `Full House, ${RANK_NAMES[groups[0].val]} over ${RANK_NAMES[groups[1].val]}`
    };
  }

  if (isFlush) {
    return {
      rank: 'Flush', rankValue: 5, kickers: values.slice(0, 5),
      bestCards: sorted, description: `Flush, ${RANK_SINGULAR[values[0]]} high`
    };
  }

  if (isStraight) {
    return {
      rank: 'Straight', rankValue: 4, kickers: [straightHigh],
      bestCards: sorted, description: `Straight, ${RANK_SINGULAR[straightHigh]} high`
    };
  }

  if (groups[0].count === 3) {
    return {
      rank: 'Three of a Kind', rankValue: 3,
      kickers: [groups[0].val, groups[1].val, groups[2].val],
      bestCards: sorted, description: `Three ${RANK_NAMES[groups[0].val]}`
    };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].val, groups[1].val);
    const lowPair = Math.min(groups[0].val, groups[1].val);
    const kicker = groups[2].val;
    return {
      rank: 'Two Pair', rankValue: 2, kickers: [highPair, lowPair, kicker],
      bestCards: sorted, description: `Two Pair, ${RANK_NAMES[highPair]} and ${RANK_NAMES[lowPair]}`
    };
  }

  if (groups[0].count === 2) {
    return {
      rank: 'Pair', rankValue: 1,
      kickers: [groups[0].val, groups[1].val, groups[2].val, groups[3].val],
      bestCards: sorted, description: `Pair of ${RANK_NAMES[groups[0].val]}`
    };
  }

  return {
    rank: 'High Card', rankValue: 0,
    kickers: values.slice(0, 5),
    bestCards: sorted, description: `${RANK_SINGULAR[values[0]]} High`
  };
}

// Evaluate the best 5-card hand from up to 7 cards
export function evaluateHand(holeCards: CardType[], communityCards: CardType[]): EvaluatedHand {
  const allCards = [...holeCards, ...communityCards];

  if (allCards.length < 5) {
    // Not enough cards for full evaluation — return partial info without dummy padding
    if (allCards.length === 0) {
      return { rank: 'High Card', rankValue: 0, kickers: [], bestCards: [], description: 'No cards' };
    }
    // Sort by value descending to show best cards
    const sorted = [...allCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    return {
      rank: 'High Card',
      rankValue: 0,
      kickers: sorted.map(c => RANK_VALUES[c.rank]),
      bestCards: sorted,
      description: `${sorted[0].rank} high (${allCards.length} cards)`,
    };
  }

  const combos = combinations(allCards, 5);
  let bestHand: EvaluatedHand | null = null;

  for (const combo of combos) {
    const hand = evaluate5(combo);
    if (!bestHand || compareHands(hand, bestHand) > 0) {
      bestHand = hand;
    }
  }

  return bestHand!;
}

// Compare two evaluated hands. Returns >0 if a wins, <0 if b wins, 0 if tie
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

// Determine winners from multiple players
export interface PlayerResult {
  playerId: string;
  hand: EvaluatedHand;
  isWinner: boolean;
}

export function determineWinners(
  players: { id: string; cards: CardType[] }[],
  communityCards: CardType[]
): PlayerResult[] {
  const results: PlayerResult[] = players.map(p => ({
    playerId: p.id,
    hand: evaluateHand(p.cards, communityCards),
    isWinner: false,
  }));

  // Find best hand
  let bestResult = results[0];
  for (let i = 1; i < results.length; i++) {
    if (compareHands(results[i].hand, bestResult.hand) > 0) {
      bestResult = results[i];
    }
  }

  // Mark all players with the same best hand as winners (split pot)
  for (const r of results) {
    if (compareHands(r.hand, bestResult.hand) === 0) {
      r.isWinner = true;
    }
  }

  return results;
}

// Get hand strength as a percentage (0-100) for the HUD meter
// Based on pre-flop hand rankings and post-flop evaluation
export function getHandStrength(holeCards: CardType[], communityCards: CardType[]): {
  percentage: number;
  label: string;
  color: string;
} {
  if (!holeCards || holeCards.length < 2) {
    return { percentage: 0, label: 'No Hand', color: '#666' };
  }

  const hand = evaluateHand(holeCards, communityCards);

  // Map hand rank to approximate strength percentage
  const strengthMap: Record<number, { min: number; max: number }> = {
    0: { min: 5, max: 25 },   // High Card
    1: { min: 25, max: 45 },  // Pair
    2: { min: 45, max: 60 },  // Two Pair
    3: { min: 55, max: 70 },  // Three of a Kind
    4: { min: 65, max: 78 },  // Straight
    5: { min: 72, max: 85 },  // Flush
    6: { min: 80, max: 90 },  // Full House
    7: { min: 88, max: 95 },  // Four of a Kind
    8: { min: 93, max: 99 },  // Straight Flush
    9: { min: 99, max: 100 }, // Royal Flush
  };

  const range = strengthMap[hand.rankValue];
  // Use kicker values to interpolate within the range
  const kickerSum = hand.kickers.reduce((a, b) => a + b, 0);
  const maxKickerSum = 14 * hand.kickers.length;
  const ratio = maxKickerSum > 0 ? kickerSum / maxKickerSum : 0.5;
  const percentage = Math.round(range.min + (range.max - range.min) * ratio);

  // Color based on strength
  let color = '#ef4444'; // red
  if (percentage >= 75) color = '#22c55e'; // green
  else if (percentage >= 50) color = '#f59e0b'; // amber
  else if (percentage >= 30) color = '#f97316'; // orange

  return { percentage, label: hand.description, color };
}

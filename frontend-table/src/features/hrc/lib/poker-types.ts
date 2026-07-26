export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface CardType {
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  avatar?: string;
  cards?: [CardType, CardType];
  isActive: boolean;
  isDealer: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  isBot?: boolean;
  currentBet: number;
  isSittingOut?: boolean;
  awaitingReady?: boolean;
  waitingForBB?: boolean;
  missedBlinds?: boolean;
  status: 'thinking' | 'folded' | 'all-in' | 'checked' | 'waiting' | 'called' | 'raised' | 'sitting-out';
  timeLeft?: number; // percentage 0-100
  timeBankSeconds?: number; // personal time bank remaining (seconds)
}

export interface InsuranceOfferClient {
  playerId: string;
  equity: number;
  cashOutAmount: number;
  fee: number;
}

export interface RunItBoardClient {
  communityCards: CardType[];
  winners: string[];
  potShare: number;
}

export interface GameState {
  pot: number;
  communityCards: CardType[];
  currentTurnPlayerId: string;
  dealerId: string;
  phase: GamePhase;
  minBet: number;
  minRaise?: number;
  lastAggressorId?: string;
  dealingPhase?: 'idle' | 'dealing' | 'dealt';
  lastAction?: { playerId: string; action: string; amount?: number };
  actionNumber?: number;
  handNumber?: number;
  // Phase 3 extensions
  insuranceOffer?: InsuranceOfferClient | null;
  insuranceActive?: boolean;
  runItPending?: boolean;
  runItBoards?: RunItBoardClient[] | null;
  smallBlind?: number;
  bigBlind?: number;
  // Timer data from server
  turnDeadline?: number; // server timestamp (ms) when current turn expires
  turnTimerDuration?: number; // base turn duration in seconds
}

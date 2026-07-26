import { create } from "zustand";
import type { CardType, Player, GamePhase } from "@/features/hrc/lib/poker-types";

/**
 * Blueprint Section 7 — hand slice + players slice
 * Single source of truth for current hand snapshot.
 */

export interface HandState {
  handId: string;
  timestamp: string;
  potAmount: number;
  boardCards: CardType[];
  street: GamePhase;
  dealerPosition: number;
  currentActionIndex: number;
  actions: ReplayAction[];
  winners: WinnerState[];
  verification: VerificationState;
}

export interface ReplayAction {
  id: string;
  street: "pre-flop" | "flop" | "turn" | "river" | "showdown";
  actorSeat: number;
  type:
    | "post_blind"
    | "check"
    | "call"
    | "bet"
    | "raise"
    | "fold"
    | "reveal"
    | "win";
  amount?: number;
  potAfter?: number;
  targetSeat?: number;
  cards?: CardType[];
  timestampOffsetMs?: number;
}

export interface WinnerState {
  playerId: string;
  seatIndex: number;
  amount: number;
  handLabel: string;
}

export interface VerificationState {
  status: "verified" | "pending" | "failed";
  hash: string;
  network?: string;
  explorerUrl?: string;
}

export interface PlayerState {
  id: string;
  seatIndex: number;
  displayName: string;
  avatar: string;
  stackStart: number;
  stackCurrent: number;
  holeCards: CardType[];
  status: "active" | "folded" | "all-in" | "out";
  result: "win" | "loss" | "neutral";
  amountDelta: number;
  handLabel: string;
}

interface GameStore {
  // Hand state
  hand: HandState | null;
  setHand: (hand: HandState) => void;

  // Players state
  players: PlayerState[];
  setPlayers: (players: PlayerState[]) => void;
  updatePlayer: (id: string, updates: Partial<PlayerState>) => void;

  // Quick accessors mapped from existing game state
  pot: number;
  setPot: (pot: number) => void;
  boardCards: CardType[];
  setBoardCards: (cards: CardType[]) => void;
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;
  currentTurnSeat: number;
  setCurrentTurnSeat: (seat: number) => void;
  dealerSeat: number;
  setDealerSeat: (seat: number) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  hand: null,
  players: [],
  pot: 0,
  boardCards: [],
  phase: "waiting" as GamePhase,
  currentTurnSeat: -1,
  dealerSeat: -1,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setHand: (hand) => set({ hand }),

  setPlayers: (players) => set({ players }),
  updatePlayer: (id, updates) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  setPot: (pot) => set({ pot }),
  setBoardCards: (boardCards) => set({ boardCards }),
  setPhase: (phase) => set({ phase }),
  setCurrentTurnSeat: (currentTurnSeat) => set({ currentTurnSeat }),
  setDealerSeat: (dealerSeat) => set({ dealerSeat }),

  reset: () => set(initialState),
}));

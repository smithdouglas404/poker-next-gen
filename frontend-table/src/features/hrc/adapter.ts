// Adapter: our Nakama TableSnapshot -> the HRC table's Player / GameState shapes.
//
// This is the whole seam between the two codebases. HRC's table binds to its own
// ws-client + game-engine; we bind to Nakama through GameProvider. Everything else in
// src/features/hrc is HRC's code unmodified, so this file is the only place the two
// models meet — keep the translation here rather than editing ported components.
//
// Direction is one-way by design: snapshot -> view model. The server stays
// authoritative and the view never invents state (CLAUDE.md non-negotiable #3).

import type { CardType, GamePhase, GameState, Player, Rank, Suit } from "./lib/poker-types";
import type { CardView, SeatView, TableSnapshot } from "@/features/game/protocol";

const SUIT_BY_LETTER: Record<string, Suit> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

/** "As" | "Td" | "10h" -> { rank, suit }. Returns null for an unparseable code. */
export function toCard(card: CardView | undefined): CardType | null {
  if (!card?.code) return null;
  const suit = SUIT_BY_LETTER[card.code.slice(-1).toLowerCase()];
  if (!suit) return null;
  // HRC spells the ten "10"; our codes use "T".
  const rank = card.code.slice(0, -1).toUpperCase().replace(/^T$/, "10") as Rank;
  return { rank, suit, hidden: card.face_up === false };
}

export function toCards(cards: CardView[] | undefined): CardType[] {
  return (cards ?? []).map(toCard).filter((c): c is CardType => c !== null);
}

// Our snapshot phase strings -> HRC's GamePhase union.
const PHASE: Record<string, GamePhase> = {
  waiting: "waiting",
  preflop: "pre-flop",
  "pre-flop": "pre-flop",
  flop: "flop",
  turn: "turn",
  river: "river",
  showdown: "showdown",
};

export function toPhase(phase: string | undefined): GamePhase {
  return PHASE[(phase ?? "").toLowerCase()] ?? "waiting";
}

// A seat carries both a status and a last_action; HRC folds them into one status.
// last_action wins when present because it is the more specific signal ("raised"
// reads better than "thinking"), except for the terminal states.
function toStatus(seat: SeatView, isActive: boolean): Player["status"] {
  const s = (seat.status ?? "").toLowerCase();
  if (s.includes("fold")) return "folded";
  if (s.includes("all") && s.includes("in")) return "all-in";
  if (seat.sitting_out || s.includes("sitting")) return "sitting-out";

  const a = (seat.last_action ?? "").toLowerCase();
  if (a.includes("raise") || a.includes("bet")) return "raised";
  if (a.includes("call")) return "called";
  if (a.includes("check")) return "checked";

  return isActive ? "thinking" : "waiting";
}

/** A stable id for a seat — empty seats still need one so React keys stay put. */
export function seatId(seat: SeatView): string {
  return seat.user_id || `seat-${seat.index}`;
}

export interface AdaptOptions {
  /** Hero's hole cards, which arrive on a private channel, not in the snapshot. */
  heroCards?: CardView[];
  /** Avatar image url per seat index, if the caller has them resolved. */
  avatarFor?: (seat: SeatView) => string | undefined;
}

export function toPlayers(snap: TableSnapshot, opts: AdaptOptions = {}): Player[] {
  return (snap.seats ?? [])
    .filter((s) => s.user_id) // an unoccupied seat is not a Player; the table draws the empty slot
    .map((seat) => {
      const isActive = seat.index === snap.action_seat;
      const hero = seat.is_hero === true;
      const hole = hero ? toCards(opts.heroCards) : [];
      return {
        id: seatId(seat),
        name: seat.username || `Seat ${seat.index + 1}`,
        chips: seat.stack ?? 0,
        avatar: opts.avatarFor?.(seat),
        cards: hole.length >= 2 ? ([hole[0], hole[1]] as [CardType, CardType]) : undefined,
        isActive,
        isDealer: seat.index === snap.button_seat,
        isBot: seat.is_bot === true,
        currentBet: seat.bet ?? 0,
        isSittingOut: seat.sitting_out === true,
        // owes_post is our name for HRC's "must post before the natural BB".
        waitingForBB: seat.owes_post === true,
        status: toStatus(seat, isActive),
      } satisfies Player;
    });
}

export function toGameState(snap: TableSnapshot): GameState {
  const actionSeat = (snap.seats ?? []).find((s) => s.index === snap.action_seat);
  const buttonSeat = (snap.seats ?? []).find((s) => s.index === snap.button_seat);
  return {
    pot: snap.pot ?? 0,
    communityCards: toCards(snap.board),
    currentTurnPlayerId: actionSeat ? seatId(actionSeat) : "",
    dealerId: buttonSeat ? seatId(buttonSeat) : "",
    phase: toPhase(snap.phase),
    minBet: snap.current_bet ?? 0,
    smallBlind: snap.small_blind,
    bigBlind: snap.big_blind,
    handNumber: snap.hand_no,
  };
}

/** Convenience: everything the HRC table needs from one snapshot. */
export function adaptSnapshot(snap: TableSnapshot, opts: AdaptOptions = {}) {
  return {
    players: toPlayers(snap, opts),
    gameState: toGameState(snap),
    maxSeats: snap.max_seats ?? 10,
    dealerSeatIndex: snap.button_seat ?? -1,
  };
}

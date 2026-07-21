import type { Container } from "pixi.js";

import type { CardView, SeatView, TableSnapshot } from "@/features/game/protocol";

import { createCardFace } from "./createCardFace";
import { getCardDimensions, getCardTarget, getSeatPositions } from "./seatLayout";
import type { TableLayout } from "./tableLayout";

/** Sync Pixi card layer to authoritative multiplayer game state. */
export function syncGameToCanvas(
  cardsLayer: Container,
  layout: TableLayout,
  snapshot: TableSnapshot | null,
  holeCards: CardView[],
  heroSeat: number,
): void {
  cardsLayer.removeChildren();
  if (!snapshot) return;

  const { width, height } = getCardDimensions(layout);
  const seats = getSeatPositions(layout, snapshot.max_seats ?? snapshot.seats.length);

  // PLO deals 4 hole cards; opponents show that many face-down.
  const holeCount = snapshot.variant === "plo" ? 4 : 2;
  const scale = holeCount > 2 ? 0.82 : 1;

  // Hole cards per seated player
  for (const seatView of snapshot.seats) {
    if (seatView.status === "empty" || !seatView.user_id) continue;
    const seat = seats[seatView.index];
    if (!seat) continue;

    const isHero = seatView.index === heroSeat;
    const cards: CardView[] =
      isHero && holeCards.length > 0
        ? holeCards
        : Array.from({ length: holeCount }, () => ({ code: "", face_up: false }));

    cards.forEach((cv, cardIndex) => {
      const target = getCardTarget(layout, seat, cardIndex, cards.length);
      const card = createCardFace(width * scale, height * scale, cv.code, cv.face_up);
      card.position.set(target.x, target.y);
      card.rotation = target.rotation;
      cardsLayer.addChild(card);
    });
  }

  // Community board in center
  const boardY = layout.cy - layout.feltRy * 0.08;
  const spacing = width * 0.55;
  const startX = layout.cx - spacing * 2;

  snapshot.board.forEach((cv, i) => {
    const card = createCardFace(width * 0.95, height * 0.95, cv.code, true);
    card.position.set(startX + i * spacing, boardY);
    cardsLayer.addChild(card);
  });
}

export function heroSeatIndex(seats: SeatView[], userId: string): number {
  return seats.find((s) => s.user_id === userId)?.index ?? -1;
}

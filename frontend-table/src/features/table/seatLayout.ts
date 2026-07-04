import type { TableLayout } from "./tableLayout";

export const SEAT_COUNT = 6;
export const CARDS_PER_SEAT = 2;
const ORBIT_SCALE = 0.88;

export interface SeatPosition {
  index: number;
  x: number;
  y: number;
  angle: number;
}

/** Seat angle in radians; index 0 is bottom center (Seat 1). */
export function seatAngle(seatIndex: number): number {
  return (seatIndex / SEAT_COUNT) * Math.PI * 2 + Math.PI / 2;
}

export function getSeatPositions(layout: TableLayout): SeatPosition[] {
  const { cx, cy, feltRx, feltRy } = layout;

  return Array.from({ length: SEAT_COUNT }, (_, index) => {
    const angle = seatAngle(index);
    return {
      index,
      x: cx + Math.cos(angle) * feltRx * ORBIT_SCALE,
      y: cy + Math.sin(angle) * feltRy * ORBIT_SCALE,
      angle,
    };
  });
}

export function getCardDimensions(layout: TableLayout): { width: number; height: number } {
  const width = Math.max(36, layout.feltRx * 0.08);
  return { width, height: width * 1.4 };
}

/** Final resting position for a hole card at a given seat. */
export function getCardTarget(
  layout: TableLayout,
  seat: SeatPosition,
  cardIndex: number,
): { x: number; y: number; rotation: number } {
  const { width } = getCardDimensions(layout);
  const inward = layout.feltRx * 0.1;
  const tangentOffset = (cardIndex - 0.5) * width * 0.62;

  const x =
    seat.x - Math.cos(seat.angle) * inward + Math.cos(seat.angle + Math.PI / 2) * tangentOffset;
  const y =
    seat.y - Math.sin(seat.angle) * inward + Math.sin(seat.angle + Math.PI / 2) * tangentOffset;

  return { x, y, rotation: seat.angle + Math.PI / 2 };
}

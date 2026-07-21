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
export function seatAngle(seatIndex: number, seatCount: number = SEAT_COUNT): number {
  return (seatIndex / seatCount) * Math.PI * 2 + Math.PI / 2;
}

export function getSeatPositions(
  layout: TableLayout,
  seatCount: number = SEAT_COUNT,
  orbitScale: number = ORBIT_SCALE,
): SeatPosition[] {
  const { cx, cy, feltRx, feltRy } = layout;

  return Array.from({ length: seatCount }, (_, index) => {
    const angle = seatAngle(index, seatCount);
    return {
      index,
      x: cx + Math.cos(angle) * feltRx * orbitScale,
      y: cy + Math.sin(angle) * feltRy * orbitScale,
      angle,
    };
  });
}

export function getCardDimensions(layout: TableLayout): { width: number; height: number } {
  const width = Math.max(44, layout.feltRx * 0.11);
  return { width, height: width * 1.4 };
}

/** Final resting position for a hole card at a given seat. `count` is how many
 *  hole cards this seat holds (2 for Hold'em, 4 for PLO) so the fan stays
 *  centered and tightens as the count grows. */
export function getCardTarget(
  layout: TableLayout,
  seat: SeatPosition,
  cardIndex: number,
  count: number = CARDS_PER_SEAT,
): { x: number; y: number; rotation: number } {
  const { width } = getCardDimensions(layout);
  const inward = layout.feltRx * 0.1;
  const spread = count > 2 ? 0.44 : 0.62;
  const tangentOffset = (cardIndex - (count - 1) / 2) * width * spread;

  const x =
    seat.x - Math.cos(seat.angle) * inward + Math.cos(seat.angle + Math.PI / 2) * tangentOffset;
  const y =
    seat.y - Math.sin(seat.angle) * inward + Math.sin(seat.angle + Math.PI / 2) * tangentOffset;

  return { x, y, rotation: seat.angle + Math.PI / 2 };
}

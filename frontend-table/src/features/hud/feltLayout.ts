import type { TableLayout } from "@/features/table/tableLayout";
import { TABLE_SEATS } from "@/features/hrc/lib/table-constants";

/** The DOM attribute ImageTable stamps on the felt image's wrapper so the seat
 *  layer can find and measure it. */
export const FELT_SURFACE_ATTR = "data-felt-surface";

/**
 * Build the seat-ring layout from the felt's ACTUAL rendered rectangle.
 *
 * Why this exists: the felt image is positioned by static CSS (FELT_BOUNDS —
 * `left:50%`, `top:calc(50% + 45px)`, `width:72.9%`, `aspect-ratio:1408/768`)
 * while `computeTableLayout` derived the seat ellipse independently from the
 * raw viewport (`cy = height/2`, `ry = rx * 0.56`, an 8% margin). Two separate
 * coordinate systems for one table:
 *
 *   - different centres — the felt sits 45px lower than the ring,
 *   - different aspect ratios — 1408/768 = 1.833 vs 1/0.56 = 1.786,
 *   - and only the ring honoured the Room-drawer inset, so opening the drawer
 *     slid the seats right while the felt stayed put.
 *
 * They only lined up by coincidence at one window size. Measuring the felt
 * makes it the single source of truth: whatever CSS decides the table's box
 * is, the seats are inscribed in exactly that box, at every size, with no
 * duplicated math to drift.
 */
export function layoutFromFeltRect(rect: DOMRect): TableLayout {
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  // Same proportion computeTableLayout used, so plaque/rail spacing is unchanged.
  const railThickness = Math.max(14, Math.min(rx, ry) * 0.09);
  return {
    cx: rect.left + rx,
    cy: rect.top + ry,
    rx,
    ry,
    feltRx: rx - railThickness * 1.15,
    feltRy: ry - railThickness * 1.15,
    railThickness,
  };
}

/**
 * Where an EMPTY seat card must be drawn, in viewport pixels.
 *
 * This has to agree with where the avatar appears once someone sits, and the
 * occupied seats are NOT on a computed ellipse: HrcTable renders them inside
 * `<div style={FELT_BOUNDS}>` at `TABLE_SEATS[visual]`, a hand-tuned irregular
 * ring expressed as percentages of the felt box (seat 2 sits at x: -0.8, i.e.
 * deliberately just outside the felt's left edge).
 *
 * SeatHud used to place the empty "SIT HERE" cards on `getSeatPositions`'s
 * mathematical ellipse in viewport space instead. Two different rings, so an
 * empty box and the avatar that replaces it landed in different places — the
 * squares floating over the felt and over other seats.
 *
 * Mapping TABLE_SEATS through the felt's measured rect reproduces exactly what
 * the browser does for those percentage-positioned children, so the empty card
 * lands precisely on the seat its avatar will occupy.
 *
 * `visualIndex` is the hero-rotated index (0 = hero, bottom centre), matching
 * HrcTable's `(seatIdx - heroSeatIdx + maxSeats) % maxSeats`.
 */
export function seatPointFromFelt(
  rect: DOMRect,
  visualIndex: number,
): { x: number; y: number; scale: number } {
  const pose = TABLE_SEATS[visualIndex % TABLE_SEATS.length];
  return {
    x: rect.left + (pose.x / 100) * rect.width,
    y: rect.top + (pose.y / 100) * rect.height,
    scale: pose.scale,
  };
}

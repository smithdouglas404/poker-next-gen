import type { CSSProperties } from "react";
import { FELT_BOUNDS, seatPose } from "@/features/hrc/lib/table-constants";
import {
  useRoomPanelOpen,
  ROOM_PANEL_WIDTH_PX,
  SHOW_LEFT_PANEL_COLUMN,
} from "@/features/hud/roomPanelState";

/** The DOM attribute ImageTable stamps on the felt image's wrapper so the seat
 *  layer can find and measure it. */
export const FELT_SURFACE_ATTR = "data-felt-surface";

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
  seatCount: number,
): { x: number; y: number; scale: number } {
  // seatCount matters: TABLE_SEATS is a TEN-seat ring, and taking its first N
  // entries for a smaller table puts every seat on the left and bottom. See
  // seatRingIndex.
  const pose = seatPose(visualIndex, seatCount);
  return {
    x: rect.left + (pose.x / 100) * rect.width,
    y: rect.top + (pose.y / 100) * rect.height,
    scale: pose.scale,
  };
}

/**
 * THE box for the table. Every FELT_BOUNDS consumer must use this and nothing
 * else — the felt image (TableFeltBackdrop), ImageTable's two layers, and
 * HrcTable's seat layer.
 *
 * Four components previously each decided for themselves whether the Room
 * drawer was open and whether `?demo=1` suppressed it. Any disagreement put
 * the layers 144px (half the drawer width) apart — which is exactly what
 * happened: the felt shifted while the avatars did not.
 */
export function useFeltStyle(): { style: CSSProperties; insetLeft: number } {
  const [roomPanelOpen] = useRoomPanelOpen(true);
  // Only reserve the drawer's width if the drawer is actually MOUNTED.
  //
  // RoomPanel renders solely inside TableHud's `SHOW_LEFT_PANEL_COLUMN && (…)`
  // block, which is off. While this read `!demo && roomPanelOpen` the real
  // /table shifted `left: calc(50% + 144px)` to clear a drawer that no longer
  // existed — measured: felt centre 944 on /table vs 800 on ?demo=1, in a
  // 1600px viewport. And because the condition carried `!demo`, ?demo=1 was
  // exempt, so the preview looked right while the live table did not: the same
  // `!demo` divergence that hid the panel column itself.
  //
  // The `!demo` is GONE, not merely made unreachable. The felt box is pure
  // layout, so demo must have no say in it at all — see check:table's
  // demo-is-data-only rule.
  const insetLeft = SHOW_LEFT_PANEL_COLUMN && roomPanelOpen ? ROOM_PANEL_WIDTH_PX : 0;
  return {
    insetLeft,
    style: insetLeft
      ? { ...FELT_BOUNDS, left: `calc(50% + ${insetLeft / 2}px)` }
      : FELT_BOUNDS,
  };
}

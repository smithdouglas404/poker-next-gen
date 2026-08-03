import { useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { TABLE_SEATS, FELT_BOUNDS } from "@/features/hrc/lib/table-constants";
import { useRoomPanelOpen, ROOM_PANEL_WIDTH_PX } from "@/features/hud/roomPanelState";

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
): { x: number; y: number; scale: number } {
  const pose = TABLE_SEATS[visualIndex % TABLE_SEATS.length];
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
  const demo = useSearchParams().get("demo") === "1";
  const [roomPanelOpen] = useRoomPanelOpen(true);
  const insetLeft = !demo && roomPanelOpen ? ROOM_PANEL_WIDTH_PX : 0;
  return {
    insetLeft,
    style: insetLeft
      ? { ...FELT_BOUNDS, left: `calc(50% + ${insetLeft / 2}px)` }
      : FELT_BOUNDS,
  };
}

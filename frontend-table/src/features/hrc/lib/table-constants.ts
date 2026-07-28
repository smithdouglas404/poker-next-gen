import type { CSSProperties } from "react";

// Single shared position/size formula for the felt image, the game-overlay
// layer (cards/pot/dealer), and the seat layer — all three must render at
// IDENTICAL bounds or they drift out of sync with each other (three
// independently-duplicated copies of this exact object was the actual bug
// behind seats/cards reading as disconnected from the rail). Width is set to
// the spec's exact felt/canvas ratio (1400/1920 = 72.9%) so it — not
// maxHeight — is always the binding constraint, matching the reference
// render's proportions exactly. `top` is nudged down from dead-center by
// half the PlayerHeader's rendered height (~45px) since the game canvas
// spans the full h-screen behind the header, which visually overlaps its
// top edge otherwise.
export const FELT_BOUNDS: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "calc(50% + 45px)",
  transform: "translate(-50%, -50%)",
  width: "72.9%",
  aspectRatio: "1408 / 768",
  maxHeight: "90%",
};

// Seat positions as % of the felt overlay div, derived from the exact
// 1920x1080 pixel spec: outer rail 1640x860 at (140,70), inner felt 1400x680
// centered within it -> felt bbox (260,160)-(1660,840). Each seat's absolute
// (X,Y) from the spec is converted to a % of that felt bbox. Every seat
// renders at the same size (scale 1.0) — the spec gives one fixed avatar
// size (110x135), no per-seat perspective shrink.
export const TABLE_SEATS = [
  { x: 50.0,   y: 93.0,   scale: 1.0 },  // 0: Hero (6 o'clock, no avatar box — hole cards + action dock only)
  { x: 15.0,   y: 98.53,  scale: 1.0 },  // 1: Bottom Left
  { x: -3.57,  y: 66.18,  scale: 1.0 },  // 2: Left Bottom
  { x: -3.57,  y: 26.47,  scale: 1.0 },  // 3: Left Top
  { x: 50.0,   y: -11.76, scale: 1.0 },  // 4: Top Center (Dealer)
  { x: 85.0,   y: 4.41,   scale: 1.0 },  // 5: Top Right
  { x: 103.57, y: 26.47,  scale: 1.0 },  // 6: Right Top
  { x: 103.57, y: 66.18,  scale: 1.0 },  // 7: Right Bottom
  { x: 85.0,   y: 98.53,  scale: 1.0 },  // 8: Bottom Right
];

// Dealer button sits between the seat and the felt center
export const DEALER_POSITIONS = [
  { x: 50.0, y: 82 },
  { x: 23,   y: 74 },
  { x: 12,   y: 50 },
  { x: 20,   y: 26 },
  { x: 36,   y: 13 },
  { x: 50,   y: 10 },
  { x: 64,   y: 13 },
  { x: 80,   y: 26 },
  { x: 88,   y: 50 },
];

export type QualityLevel = "low" | "medium" | "high";

export const QUALITY_CONFIG = {
  low: { shadows: false, particles: 0, antialias: false, shadowMapSize: 512, dpr: 1, bloom: false, ao: false },
  medium: { shadows: true, particles: 25, antialias: true, shadowMapSize: 1024, dpr: 1.5, bloom: true, ao: false },
  high: { shadows: true, particles: 50, antialias: true, shadowMapSize: 2048, dpr: 2, bloom: true, ao: true },
};

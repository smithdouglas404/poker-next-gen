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
// How an absolutely-positioned MOTION element centres itself on its left/top
// anchor. It must be the standalone CSS `translate` property, NEVER
// `transform: translate(-50%,-50%)`.
//
// framer-motion composes the entire `transform` property from the motion values
// it is handed (x/y/scale/rotate), so a `transform` written in `style` alongside
// them is replaced the moment the element animates — and the element silently
// loses its centring, landing half its own size down-and-right. That is what put
// the pot cluster at cx 932 against a felt centre of 800, the dealer button and
// burn card 22px off their anchors, the per-seat bet chips off their seats, and
// the showdown spotlight off centre by up to 400px.
//
// `translate` is a separate CSS property framer does not manage, and the spec
// applies it BEFORE `transform`, so the element is centred first and the
// animation's scale/rotate then act about that centre — exactly the intent.
//
// Enforced by `scripts/check-table-invariants.mjs` (check: motion-transform).
export const CENTRING_TRANSLATE: CSSProperties = { translate: "-50% -50%" };

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
// 10 seats, symmetric oval (mirror pairs: 1<->9, 2<->8, 3<->7, 4<->6; hero(0)
// and the dealer slot(5) sit alone on the vertical centerline). This used to
// be a 9-entry array — max_seats is 10, so seat index 9 (via the hero-relative
// `visual` rotation in HrcTable.tsx: `TABLE_SEATS[visual % TABLE_SEATS.length]`)
// wrapped back onto TABLE_SEATS[0], landing a real 10th player directly on
// top of the hero's own slot (hidden behind the action dock). The array was
// also asymmetric even at 9: the right side had 4 seats between top-center
// and hero (TopRight/RightTop/RightBottom/BottomRight) but the left side only
// had 3 — no mirror of TopRight. Added "Top Left" to fix both at once.
export const TABLE_SEATS = [
  { x: 50.0,   y: 93.0,   scale: 1.0 },  // 0: Hero (6 o'clock, no avatar box — hole cards + action dock only)
  { x: 11.0,   y: 90.0,   scale: 1.0 },  // 1: Bottom Left — split the real gap between the chat panel (right edge ~240px) and the action dock (left edge ~464px); y pulled up so the gold ring meets the rail instead of floating below it
  { x: -0.8,   y: 66.18,  scale: 1.0 },  // 2: Left Bottom — pulled in further, closer to the rail
  { x: -0.8,   y: 26.47,  scale: 1.0 },  // 3: Left Top — pulled in further, closer to the rail
  { x: 15.0,   y: 4.0,    scale: 1.0 },  // 4: Top Left — NEW, mirrors Top Right (was missing entirely)
  { x: 50.0,   y: -2.0,   scale: 1.0 },  // 5: Top Center (Dealer) — pulled in further, closer to the rail
  { x: 85.0,   y: 4.0,    scale: 1.0 },  // 6: Top Right
  { x: 100.8,  y: 26.47,  scale: 1.0 },  // 7: Right Top — pulled in further, closer to the rail
  { x: 100.8,  y: 66.18,  scale: 1.0 },  // 8: Right Bottom — pulled in further, closer to the rail
  { x: 89.0,   y: 90.0,   scale: 1.0 },  // 9: Bottom Right — mirrors seat 1
];

// Dealer button sits between the seat and the felt center — indices line up
// with TABLE_SEATS above (also extended from 9 to 10 entries for the same
// reason: max_seats is 10).
export const DEALER_POSITIONS = [
  { x: 50.0, y: 82 },   // 0: Hero
  { x: 23,   y: 74 },   // 1: Bottom Left
  { x: 12,   y: 50 },   // 2: Left Bottom
  { x: 20,   y: 26 },   // 3: Left Top
  { x: 28,   y: 19 },   // 4: Top Left — NEW, interpolated
  { x: 36,   y: 13 },   // 5: Top Center
  { x: 50,   y: 10 },   // 6: Top Right
  { x: 64,   y: 13 },   // 7: Right Top
  { x: 80,   y: 26 },   // 8: Right Bottom
  { x: 88,   y: 50 },   // 9: Bottom Right
];

export type QualityLevel = "low" | "medium" | "high";

export const QUALITY_CONFIG = {
  low: { shadows: false, particles: 0, antialias: false, shadowMapSize: 512, dpr: 1, bloom: false, ao: false },
  medium: { shadows: true, particles: 25, antialias: true, shadowMapSize: 1024, dpr: 1.5, bloom: true, ao: false },
  high: { shadows: true, particles: 50, antialias: true, shadowMapSize: 2048, dpr: 2, bloom: true, ao: true },
};

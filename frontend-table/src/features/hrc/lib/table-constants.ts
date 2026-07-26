// Seat positions as % of the poker-table-container (16:9 aspect ratio).
// Positioned around the table ellipse (80% wide × 65% tall, centered).
// `scale` drives CSS custom property --seat-scale which the portrait-card
// clamp uses, so everything shrinks proportionally with the container.
// Seat positions as % of the table-image overlay div (1408x768 aspect).
// Seats sit on/just outside the rail edge of the poker table image.
export const TABLE_SEATS = [
  { x: 50.0, y: 93.0, scale: 1.0  },  // 0: Hero (6 o'clock) — full size
  { x: 14.0, y: 82.0, scale: 0.93 },  // 1: bottom-left (7 o'clock)
  { x: 0.0,  y: 50.0, scale: 0.90 },  // 2: left (9 o'clock)
  { x: 10.0, y: 16.0, scale: 0.86 },  // 3: top-left (11 o'clock)
  { x: 30.0, y: 2.0,  scale: 0.84 },  // 4: top-left-center
  { x: 50.0, y: -2.0, scale: 0.83 },  // 5: top-center (12 o'clock) — smallest
  { x: 70.0, y: 2.0,  scale: 0.84 },  // 6: top-right-center
  { x: 90.0, y: 16.0, scale: 0.86 },  // 7: top-right (1 o'clock)
  { x: 100.0,y: 50.0, scale: 0.90 },  // 8: right (3 o'clock)
  { x: 86.0, y: 82.0, scale: 0.93 },  // 9: bottom-right (5 o'clock)
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
  { x: 77,   y: 74 },
];

export type QualityLevel = "low" | "medium" | "high";

export const QUALITY_CONFIG = {
  low: { shadows: false, particles: 0, antialias: false, shadowMapSize: 512, dpr: 1, bloom: false, ao: false },
  medium: { shadows: true, particles: 25, antialias: true, shadowMapSize: 1024, dpr: 1.5, bloom: true, ao: false },
  high: { shadows: true, particles: 50, antialias: true, shadowMapSize: 2048, dpr: 2, bloom: true, ao: true },
};

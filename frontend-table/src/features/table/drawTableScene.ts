import { Container, Graphics, Text } from "pixi.js";

import { TABLE_COLORS } from "./colors";

const SEAT_COUNT = 6;

export interface TableLayout {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  feltRx: number;
  feltRy: number;
  railThickness: number;
}

/** Linearly blend two 0xRRGGBB colors by t in [0, 1]. */
function blend(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function computeTableLayout(width: number, height: number): TableLayout {
  const cx = width / 2;
  const cy = height / 2;
  const margin = Math.min(width, height) * 0.08;
  const maxRx = width / 2 - margin;
  const maxRy = height / 2 - margin;

  let rx = maxRx;
  let ry = rx * 0.56;
  if (ry > maxRy) {
    ry = maxRy;
    rx = ry / 0.56;
  }

  const railThickness = Math.max(14, Math.min(rx, ry) * 0.09);
  const feltRx = rx - railThickness * 1.15;
  const feltRy = ry - railThickness * 1.15;

  return { cx, cy, rx, ry, feltRx, feltRy, railThickness };
}

/**
 * Paints the premium deep-green elliptical poker table, six player seat
 * placeholders, and the center dev-canvas label onto the supplied stage.
 */
export function drawTableScene(stage: Container, width: number, height: number): void {
  stage.removeChildren();

  const layout = computeTableLayout(width, height);
  const { cx, cy, rx, ry, feltRx, feltRy, railThickness } = layout;

  // Ambient drop shadow beneath the table for depth.
  const shadow = new Graphics();
  shadow
    .ellipse(cx, cy + ry * 0.08, rx * 1.04, ry * 1.06)
    .fill({ color: TABLE_COLORS.shadow, alpha: 0.45 });
  stage.addChild(shadow);

  // Outer wooden rail — raised boundary encircling the felt.
  const railOuter = new Graphics();
  railOuter
    .ellipse(cx, cy, rx, ry)
    .fill({ color: TABLE_COLORS.railOuter })
    .ellipse(cx, cy, rx - railThickness * 0.45, ry - railThickness * 0.45)
    .fill({ color: TABLE_COLORS.railInner });
  stage.addChild(railOuter);

  // Deep-green playing felt.
  const felt = new Graphics();
  felt.ellipse(cx, cy, feltRx, feltRy).fill({ color: TABLE_COLORS.feltDeep });
  stage.addChild(felt);

  // Radial shading stack to suggest a top-down 3D dome of light.
  const rings = 6;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const ring = new Graphics();
    ring.ellipse(cx, cy, feltRx * (1 - t * 0.85), feltRy * (1 - t * 0.85)).fill({
      color: blend(TABLE_COLORS.feltDeep, TABLE_COLORS.feltHighlight, t),
      alpha: 0.28,
    });
    stage.addChild(ring);
  }

  // Gold inner border — premium lip between rail and felt.
  const goldBorder = new Graphics();
  goldBorder
    .ellipse(cx, cy, feltRx, feltRy)
    .stroke({
      color: TABLE_COLORS.gold,
      width: Math.max(2.5, railThickness * 0.16),
      alpha: 0.95,
    });
  stage.addChild(goldBorder);

  // Secondary inner gold accent for a sleek double-line finish.
  const goldAccent = new Graphics();
  goldAccent
    .ellipse(cx, cy, feltRx * 0.94, feltRy * 0.94)
    .stroke({
      color: TABLE_COLORS.goldBright,
      width: Math.max(1, railThickness * 0.05),
      alpha: 0.35,
    });
  stage.addChild(goldAccent);

  drawPlayerSeats(stage, layout);
  drawCenterLabel(stage, layout);
}

function drawPlayerSeats(stage: Container, layout: TableLayout): void {
  const { cx, cy, feltRx, feltRy, railThickness } = layout;
  const seatWidth = Math.max(72, feltRx * 0.18);
  const seatHeight = Math.max(48, feltRy * 0.14);
  const seatRadius = Math.max(6, railThickness * 0.25);
  const orbitScale = 0.88;

  for (let i = 0; i < SEAT_COUNT; i++) {
    // Evenly distribute seats around the oval, starting from the bottom center.
    const angle = (i / SEAT_COUNT) * Math.PI * 2 + Math.PI / 2;
    const px = cx + Math.cos(angle) * feltRx * orbitScale;
    const py = cy + Math.sin(angle) * feltRy * orbitScale;

    const seat = new Graphics();
    seat
      .roundRect(-seatWidth / 2, -seatHeight / 2, seatWidth, seatHeight, seatRadius)
      .fill({ color: TABLE_COLORS.seatFill, alpha: 0.72 })
      .stroke({ color: TABLE_COLORS.seatStroke, width: 2, alpha: 0.85 });

    seat.position.set(px, py);
    seat.rotation = angle + Math.PI / 2;
    stage.addChild(seat);

    const label = new Text({
      text: `SEAT ${i + 1}`,
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: Math.max(10, seatHeight * 0.22),
        fontWeight: "600",
        fill: TABLE_COLORS.goldBright,
        letterSpacing: 1,
        align: "center",
      },
    });
    label.anchor.set(0.5);
    label.position.set(px, py);
    label.rotation = angle + Math.PI / 2;
    stage.addChild(label);
  }
}

function drawCenterLabel(stage: Container, layout: TableLayout): void {
  const { cx, cy, feltRx, feltRy } = layout;
  const fontSize = Math.max(16, Math.min(feltRx, feltRy) * 0.09);

  const label = new Text({
    text: "POKER NEXT-GEN DEV CANVAS",
    style: {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize,
      fontWeight: "bold",
      fill: TABLE_COLORS.centerText,
      stroke: { color: TABLE_COLORS.centerTextStroke, width: Math.max(2, fontSize * 0.08) },
      letterSpacing: 2,
      align: "center",
    },
  });

  label.anchor.set(0.5);
  label.position.set(cx, cy);
  stage.addChild(label);
}

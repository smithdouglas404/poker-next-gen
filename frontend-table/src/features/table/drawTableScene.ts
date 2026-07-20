import { Container, Graphics } from "pixi.js";

import { TABLE_COLORS } from "./colors";
import { computeTableLayout, type TableLayout } from "./tableLayout";

export type { TableLayout } from "./tableLayout";
export { computeTableLayout } from "./tableLayout";
export { getSeatPositions, SEAT_COUNT, seatAngle } from "./seatLayout";

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

/**
 * Paints the static table surface onto `tableLayer` and returns layout metrics
 * used by seat/card placement and deal animations.
 */
export function drawTableLayer(
  tableLayer: Container,
  width: number,
  height: number,
): TableLayout {
  tableLayer.removeChildren();

  const layout = computeTableLayout(width, height);
  const { cx, cy, rx, ry, feltRx, feltRy, railThickness } = layout;

  const shadow = new Graphics();
  shadow
    .ellipse(cx, cy + ry * 0.08, rx * 1.04, ry * 1.06)
    .fill({ color: TABLE_COLORS.shadow, alpha: 0.45 });
  tableLayer.addChild(shadow);

  const railOuter = new Graphics();
  railOuter
    .ellipse(cx, cy, rx, ry)
    .fill({ color: TABLE_COLORS.railOuter })
    .ellipse(cx, cy, rx - railThickness * 0.45, ry - railThickness * 0.45)
    .fill({ color: TABLE_COLORS.railInner });
  tableLayer.addChild(railOuter);

  const felt = new Graphics();
  felt.ellipse(cx, cy, feltRx, feltRy).fill({ color: TABLE_COLORS.feltDeep });
  tableLayer.addChild(felt);

  const rings = 6;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const ring = new Graphics();
    ring.ellipse(cx, cy, feltRx * (1 - t * 0.85), feltRy * (1 - t * 0.85)).fill({
      color: blend(TABLE_COLORS.feltDeep, TABLE_COLORS.feltHighlight, t),
      alpha: 0.28,
    });
    tableLayer.addChild(ring);
  }

  const goldBorder = new Graphics();
  goldBorder
    .ellipse(cx, cy, feltRx, feltRy)
    .stroke({
      color: TABLE_COLORS.gold,
      width: Math.max(2.5, railThickness * 0.16),
      alpha: 0.95,
    });
  tableLayer.addChild(goldBorder);

  const goldAccent = new Graphics();
  goldAccent
    .ellipse(cx, cy, feltRx * 0.94, feltRy * 0.94)
    .stroke({
      color: TABLE_COLORS.goldBright,
      width: Math.max(1, railThickness * 0.05),
      alpha: 0.35,
    });
  tableLayer.addChild(goldAccent);

  drawLayoutBoundaries(tableLayer, layout);

  return layout;
}

/** @deprecated Use drawTableLayer. */
export function drawTableScene(stage: Container, width: number, height: number): TableLayout {
  return drawTableLayer(stage, width, height);
}

function drawLayoutBoundaries(stage: Container, layout: TableLayout): void {
  const { cx, cy, feltRx, feltRy, railThickness } = layout;
  const lineWidth = Math.max(1.5, railThickness * 0.06);

  const bettingLine = new Graphics();
  bettingLine
    .ellipse(cx, cy, feltRx * 0.72, feltRy * 0.72)
    .stroke({ color: 0xf3f4f6, width: lineWidth, alpha: 0.35 });
  stage.addChild(bettingLine);

  const actionZone = new Graphics();
  actionZone
    .ellipse(cx, cy, feltRx * 0.28, feltRy * 0.28)
    .stroke({ color: TABLE_COLORS.gold, width: lineWidth, alpha: 0.45 });
  stage.addChild(actionZone);

  const seatOrbit = new Graphics();
  seatOrbit
    .ellipse(cx, cy, feltRx * 0.88, feltRy * 0.88)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.12 });
  stage.addChild(seatOrbit);
}


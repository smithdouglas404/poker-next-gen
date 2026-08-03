export interface TableLayout {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  feltRx: number;
  feltRy: number;
  railThickness: number;
}

/** `insetLeft` reserves a strip on the left (e.g. the open Room Control
 *  drawer) so the seat ring shifts right and shrinks to clear it, instead of
 *  seats landing underneath a higher-z-index panel and becoming unreachable. */
export function computeTableLayout(width: number, height: number, insetLeft: number = 0): TableLayout {
  const usableWidth = Math.max(width - insetLeft, 0);
  const cx = insetLeft + usableWidth / 2;
  const cy = height / 2;
  const margin = Math.min(usableWidth, height) * 0.08;
  const maxRx = usableWidth / 2 - margin;
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

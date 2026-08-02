export interface TableLayout {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  feltRx: number;
  feltRy: number;
  railThickness: number;
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

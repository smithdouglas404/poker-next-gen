import { Container, Graphics } from "pixi.js";

import { getSeatPositions } from "./seatLayout";
import type { TableLayout } from "./tableLayout";

// GPU chip animations: chips fly from a seat to the pot on a bet/call, and sweep
// from the pot to the winner at showdown — the touch that makes the table feel
// like a finished poker product.

const CHIP_COLORS = [0xd4af37, 0x22c55e, 0x3b82f6, 0xef4444];

function makeChip(color: number, r: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color });
  g.circle(0, 0, r).stroke({ color: 0xf3e2ad, width: Math.max(1, r * 0.18), alpha: 0.9 });
  g.circle(0, 0, r * 0.55).stroke({ color: 0x000000, width: Math.max(1, r * 0.12), alpha: 0.25 });
  return g;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Pot location on the felt (just below the community cards). */
export function potPoint(layout: TableLayout): { x: number; y: number } {
  return { x: layout.cx, y: layout.cy + layout.feltRy * 0.12 };
}

interface Flying {
  chip: Graphics;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startMs: number;
  durationMs: number;
}

/**
 * Fly `count` chips from → to with a small spread + stagger, then remove them
 * (unless `settle` keeps them at the destination). Returns a cancel handle.
 */
export function flyChips(
  layer: Container,
  from: { x: number; y: number },
  to: { x: number; y: number },
  count: number,
  opts: { durationMs?: number; radius?: number; settle?: boolean } = {},
): () => void {
  const durationMs = opts.durationMs ?? 620;
  const radius = opts.radius ?? Math.max(7, count > 6 ? 8 : 9);
  const flying: Flying[] = [];
  const base = performance.now();

  for (let i = 0; i < count; i++) {
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    const chip = makeChip(color, radius);
    const spread = 10;
    const ox = (Math.random() - 0.5) * spread;
    const oy = (Math.random() - 0.5) * spread;
    chip.position.set(from.x + ox, from.y + oy);
    layer.addChild(chip);
    flying.push({
      chip,
      fromX: from.x + ox,
      fromY: from.y + oy,
      toX: to.x + (Math.random() - 0.5) * 16,
      toY: to.y + (Math.random() - 0.5) * 10,
      startMs: base + i * 60,
      durationMs,
    });
  }

  let raf = 0;
  let cancelled = false;
  const tick = (now: number) => {
    if (cancelled) return;
    let alive = 0;
    for (const f of flying) {
      if (!f.chip.parent) continue;
      const t = Math.min(1, Math.max(0, (now - f.startMs) / f.durationMs));
      const e = easeOutCubic(t);
      f.chip.position.set(f.fromX + (f.toX - f.fromX) * e, f.fromY + (f.toY - f.fromY) * e);
      if (t >= 1) {
        if (!opts.settle) {
          f.chip.destroy();
        }
      } else {
        alive++;
      }
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    for (const f of flying) if (f.chip.parent) f.chip.destroy();
  };
}

/** Chips from a seat to the pot (bet/call/raise). */
export function chipsToPot(
  layer: Container,
  layout: TableLayout,
  seatIndex: number,
  seatCount: number,
  big = false,
): void {
  const positions = getSeatPositions(layout, seatCount);
  const seat = positions[seatIndex];
  if (!seat) return;
  flyChips(layer, { x: seat.x, y: seat.y }, potPoint(layout), big ? 6 : 3, { settle: true });
}

/** Pot sweeps to the winner (showdown). Clears the pot pile first. */
export function potToWinner(
  layer: Container,
  layout: TableLayout,
  seatIndex: number,
  seatCount: number,
): void {
  const positions = getSeatPositions(layout, seatCount);
  const seat = positions[seatIndex];
  if (!seat) return;
  layer.removeChildren(); // clear settled pot chips
  flyChips(layer, potPoint(layout), { x: seat.x, y: seat.y }, 8, { durationMs: 720 });
}

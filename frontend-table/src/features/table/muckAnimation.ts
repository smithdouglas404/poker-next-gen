import { Container } from "pixi.js";

import { createCardBack } from "./createCardBack";
import { getCardDimensions, getSeatPositions } from "./seatLayout";
import type { TableLayout } from "./tableLayout";

// Muck animation: at showdown, the hands that showed and lost slide face-down
// toward the muck pile and fade — the dealer sweeping away the dead cards. A
// self-contained overlay (like the chip fly), so it never fights the real card
// sprites that syncGameToCanvas manages.

function easeInCubic(t: number): number {
  return t * t * t;
}

/** Where dead cards get swept — a muck tray up-and-left of the board. */
function muckPoint(layout: TableLayout): { x: number; y: number } {
  return { x: layout.cx - layout.feltRx * 0.34, y: layout.cy - layout.feltRy * 0.34 };
}

/**
 * Slide two face-down cards from each losing seat to the muck and fade them out.
 * `loserSeats` are the seats that reached showdown but did not win.
 */
export function muckLosers(
  layer: Container,
  layout: TableLayout,
  loserSeats: number[],
  seatCount: number,
): void {
  if (loserSeats.length === 0) return;
  const positions = getSeatPositions(layout, seatCount);
  const { width, height } = getCardDimensions(layout);
  const to = muckPoint(layout);

  interface Mucking {
    card: Container;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startMs: number;
  }
  const cards: Mucking[] = [];
  const base = performance.now();
  const durationMs = 520;

  loserSeats.forEach((seatIndex, si) => {
    const seat = positions[seatIndex];
    if (!seat) return;
    for (let i = 0; i < 2; i++) {
      const card = createCardBack(width * 0.7, height * 0.7);
      const ox = (i === 0 ? -1 : 1) * width * 0.18;
      card.position.set(seat.x + ox, seat.y);
      card.alpha = 0.95;
      layer.addChild(card);
      cards.push({
        card,
        fromX: seat.x + ox,
        fromY: seat.y,
        toX: to.x + (Math.random() - 0.5) * 14,
        toY: to.y + (Math.random() - 0.5) * 10,
        startMs: base + si * 40 + i * 25,
      });
    }
  });

  let raf = 0;
  const tick = (now: number) => {
    let alive = 0;
    for (const m of cards) {
      if (!m.card.parent) continue;
      const t = Math.min(1, Math.max(0, (now - m.startMs) / durationMs));
      const e = easeInCubic(t);
      m.card.position.set(m.fromX + (m.toX - m.fromX) * e, m.fromY + (m.toY - m.fromY) * e);
      m.card.rotation = e * 0.5;
      m.card.alpha = 0.95 * (1 - e);
      if (t >= 1) m.card.destroy();
      else alive++;
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  void raf;
}

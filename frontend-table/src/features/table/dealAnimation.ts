import type { Container } from "pixi.js";

import { createCardBack } from "./createCardBack";
import {
  CARDS_PER_SEAT,
  getCardDimensions,
  getCardTarget,
  getSeatPositions,
} from "./seatLayout";
import type { TableLayout } from "./tableLayout";

const DEAL_DURATION_MS = 720;
const SEAT_STAGGER_MS = 140;
const CARD_STAGGER_MS = 80;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface SlideAnimation {
  card: Container;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromRotation: number;
  toRotation: number;
  fromScale: number;
  toScale: number;
  startMs: number;
  durationMs: number;
}

export interface DealAnimationHandle {
  cancel: () => void;
  promise: Promise<void>;
}

/**
 * Slides two card backs from the table center to each seat in clockwise order
 * (Seat 1 → Seat 6) with a slight stagger between seats and cards.
 */
export function runDealAnimation(
  cardsLayer: Container,
  layout: TableLayout,
): DealAnimationHandle {
  cardsLayer.removeChildren();

  const { width, height } = getCardDimensions(layout);
  const seats = getSeatPositions(layout);
  const animations: SlideAnimation[] = [];
  const startedAt = performance.now();

  for (let seatIndex = 0; seatIndex < seats.length; seatIndex++) {
    const seat = seats[seatIndex];
    const seatDelay = seatIndex * SEAT_STAGGER_MS;

    for (let cardIndex = 0; cardIndex < CARDS_PER_SEAT; cardIndex++) {
      const card = createCardBack(width, height);
      const target = getCardTarget(layout, seat, cardIndex);
      const cardDelay = seatDelay + cardIndex * CARD_STAGGER_MS;

      card.position.set(layout.cx, layout.cy);
      card.rotation = 0;
      card.scale.set(0.85);
      card.visible = true;
      cardsLayer.addChild(card);

      animations.push({
        card,
        fromX: layout.cx,
        fromY: layout.cy,
        toX: target.x,
        toY: target.y,
        fromRotation: 0,
        toRotation: target.rotation,
        fromScale: 0.85,
        toScale: 1,
        startMs: startedAt + cardDelay,
        durationMs: DEAL_DURATION_MS,
      });
    }
  }

  let resolvePromise!: () => void;
  let rafId = 0;
  let cancelled = false;

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const tick = () => {
    if (cancelled) return;

    const now = performance.now();
    let allComplete = animations.length === 0;

    for (const anim of animations) {
      const elapsed = now - anim.startMs;
      if (elapsed < 0) {
        allComplete = false;
        continue;
      }

      const progress = Math.min(1, elapsed / anim.durationMs);
      const eased = easeOutCubic(progress);

      anim.card.position.set(
        anim.fromX + (anim.toX - anim.fromX) * eased,
        anim.fromY + (anim.toY - anim.fromY) * eased,
      );
      anim.card.rotation = anim.fromRotation + (anim.toRotation - anim.fromRotation) * eased;
      const scale = anim.fromScale + (anim.toScale - anim.fromScale) * eased;
      anim.card.scale.set(scale);

      if (progress < 1) allComplete = false;
    }

    if (allComplete) {
      resolvePromise();
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  const cancel = () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    cardsLayer.removeChildren();
    resolvePromise();
  };

  return { cancel, promise };
}

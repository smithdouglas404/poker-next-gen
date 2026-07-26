import gsap from "gsap";
import * as THREE from "three";

/**
 * Blueprint Section 11 — Card animation moments.
 * GSAP-driven card sequences.
 *
 * Street reveal: flop deals with sequential motion.
 * Turn and river land with small emphasis.
 */

/**
 * Animate a card dealing from above to its target position.
 */
export function animateCardDeal(
  mesh: THREE.Object3D,
  targetPosition: [number, number, number],
  delay: number = 0
): gsap.core.Tween {
  // Start above the table
  mesh.position.set(0, 0.5, 0);
  mesh.rotation.set(-Math.PI / 2, 0, Math.PI); // face down

  return gsap.to(mesh.position, {
    x: targetPosition[0],
    y: targetPosition[1],
    z: targetPosition[2],
    duration: 0.4,
    delay,
    ease: "power2.out",
  });
}

/**
 * Animate card flip from face-down to face-up.
 */
export function animateCardFlip(
  mesh: THREE.Object3D,
  duration: number = 0.3
): gsap.core.Tween {
  return gsap.to(mesh.rotation, {
    z: 0,
    duration,
    ease: "power2.inOut",
  });
}

/**
 * Animate flop — 3 cards dealt sequentially.
 */
export function animateFlopDeal(
  cards: THREE.Object3D[],
  positions: [number, number, number][]
): gsap.core.Timeline {
  const tl = gsap.timeline();

  cards.forEach((card, i) => {
    if (i < 3 && i < positions.length) {
      tl.add(animateCardDeal(card, positions[i], i * 0.15), i * 0.15);
    }
  });

  return tl;
}

/**
 * Animate turn or river — single card with slight emphasis.
 */
export function animateSingleCardDeal(
  card: THREE.Object3D,
  position: [number, number, number]
): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.add(animateCardDeal(card, position));
  // Slight settle bounce
  tl.to(card.position, {
    y: position[1] + 0.01,
    duration: 0.1,
    ease: "power1.out",
  });
  tl.to(card.position, {
    y: position[1],
    duration: 0.1,
    ease: "power1.in",
  });
  return tl;
}

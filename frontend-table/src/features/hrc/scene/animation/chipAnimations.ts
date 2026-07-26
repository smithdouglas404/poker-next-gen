import gsap from "gsap";
import * as THREE from "three";

/**
 * Blueprint Section 11 — Chip movement animations.
 * GSAP-driven chip movement to pot.
 *
 * Betting events: chip motion travels to pot.
 * PotChipsGroup: slight bounce/settle animation on update.
 */

/**
 * Animate chips flying from a seat position to the pot center.
 */
export function animateChipToPot(
  chip: THREE.Object3D,
  from: [number, number, number],
  potCenter: [number, number, number] = [0, 0.1, 0],
  duration: number = 0.5
): gsap.core.Tween {
  chip.position.set(from[0], from[1], from[2]);

  return gsap.to(chip.position, {
    x: potCenter[0],
    y: potCenter[1],
    z: potCenter[2],
    duration,
    ease: "power2.inOut",
  });
}

/**
 * Pot update settle animation — slight bounce when pot increases.
 */
export function animatePotSettle(
  potGroup: THREE.Object3D,
  duration: number = 0.3
): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.to(potGroup.scale, {
    x: 1.08,
    y: 1.08,
    z: 1.08,
    duration: duration * 0.4,
    ease: "power2.out",
  });
  tl.to(potGroup.scale, {
    x: 1,
    y: 1,
    z: 1,
    duration: duration * 0.6,
    ease: "elastic.out(1, 0.5)",
  });
  return tl;
}

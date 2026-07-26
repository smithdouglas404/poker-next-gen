import gsap from "gsap";
import * as THREE from "three";

/**
 * Blueprint Section 11 — Seat animation moments.
 *
 * Fold: player ring dims, cards retract or desaturate, label updates.
 * Betting: acting seat pulses.
 * Showdown: winning player receives gold highlight, camera subtly tightens.
 */

/**
 * Pulse a seat ring's emissive intensity to draw attention.
 */
export function animateSeatPulse(
  material: THREE.MeshStandardMaterial,
  targetIntensity: number = 2.5,
  duration: number = 0.4
): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.to(material, {
    emissiveIntensity: targetIntensity,
    duration: duration * 0.4,
    ease: "power2.out",
  });
  tl.to(material, {
    emissiveIntensity: 0.6,
    duration: duration * 0.6,
    ease: "power2.in",
  });
  return tl;
}

/**
 * Dim a seat after fold — reduce opacity and emissive.
 */
export function animateSeatFold(
  material: THREE.MeshStandardMaterial,
  duration: number = 0.5
): gsap.core.Tween {
  return gsap.to(material, {
    emissiveIntensity: 0.1,
    opacity: 0.3,
    duration,
    ease: "power2.inOut",
  });
}

/**
 * Winner highlight — transition seat ring to gold emissive.
 */
export function animateWinnerHighlight(
  material: THREE.MeshStandardMaterial,
  duration: number = 0.6
): gsap.core.Timeline {
  const tl = gsap.timeline();
  // Flash bright
  tl.to(material, {
    emissiveIntensity: 3.0,
    duration: 0.2,
    ease: "power2.out",
  });
  // Settle to warm gold glow
  tl.to(material, {
    emissiveIntensity: 1.6,
    duration: duration - 0.2,
    ease: "power2.inOut",
  });
  return tl;
}

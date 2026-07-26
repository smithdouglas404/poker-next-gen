import * as THREE from "three";

/**
 * Premium felt material — green baize.
 * Uses vertex colors for the center-bright / edge-dark radial gradient.
 * Target palette: #1d8b59 (center) → #145f3c (mid) → #0d452d (edge)
 */
export function createFeltMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#156b42"),
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.FrontSide,
  });
}

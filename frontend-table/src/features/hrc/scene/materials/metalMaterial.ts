import * as THREE from "three";

/**
 * Dark gunmetal ring material — brushed dark metal with cyan reflective response.
 */
export function createGunmetalMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1a1d24"),
    roughness: 0.35,
    metalness: 0.92,
    envMapIntensity: 0.6,
  });
}

/**
 * Premium gold/brass inner ring material — warm sheen, not flat yellow.
 */
export function createGoldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c9942e"),
    roughness: 0.28,
    metalness: 0.95,
    emissive: new THREE.Color("#3d2e0a"),
    emissiveIntensity: 0.15,
    envMapIntensity: 1.2,
  });
}

/**
 * Cyan emissive material for seat ring accents.
 */
export function createCyanEmissiveMaterial(intensity = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1a3040"),
    emissive: new THREE.Color("#58f1ff"),
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.6,
    transparent: true,
    opacity: 0.95,
  });
}

/**
 * Dark structural underbody material.
 */
export function createUnderbodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#0a0c10"),
    roughness: 0.7,
    metalness: 0.3,
  });
}

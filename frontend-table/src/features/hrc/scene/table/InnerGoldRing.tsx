import { useMemo } from "react";
import * as THREE from "three";
import { createGoldMaterial } from "../materials/metalMaterial";

/**
 * Inner gold/brass ring — warm metallic accent between felt and outer ring.
 * Narrower tube than outer ring, premium prestige cue.
 */
export function InnerGoldRing() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.TorusGeometry(1, 0.025, 12, 64);
    // Slightly inside the outer ring
    geo.scale(2.22, 1, 1.46);
    const mat = createGoldMaterial();
    return { geometry: geo, material: mat };
  }, []);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0.025, 0]}
      rotation={[Math.PI / 2, 0, 0]}
    />
  );
}

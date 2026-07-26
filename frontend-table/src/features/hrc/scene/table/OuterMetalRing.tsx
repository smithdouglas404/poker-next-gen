import { useMemo } from "react";
import * as THREE from "three";
import { createGunmetalMaterial } from "../materials/metalMaterial";

/**
 * Outer ring — dark brushed gunmetal with visible mass.
 * Torus geometry scaled to ellipse, with restrained cyan reflective response
 * from emissive elements in the scene.
 */
export function OuterMetalRing() {
  const { geometry, material } = useMemo(() => {
    // Torus: radius (center of tube), tube radius, radialSegments, tubularSegments
    const geo = new THREE.TorusGeometry(1, 0.065, 16, 64);
    // Scale to match table ellipse proportions
    geo.scale(2.35, 1, 1.55);
    const mat = createGunmetalMaterial();
    return { geometry: geo, material: mat };
  }, []);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0.02, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
    />
  );
}

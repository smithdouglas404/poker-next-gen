import { useMemo } from "react";
import * as THREE from "three";
import { createFeltMaterial } from "../materials/feltMaterial";

/**
 * Premium felt surface — elliptical, center-bright edge-dark, woven texture.
 * Sits on top of the table base, slightly raised.
 */
export function FeltSurface() {
  const { geometry, material } = useMemo(() => {
    // Thin disc for the felt playing surface
    const geo = new THREE.CylinderGeometry(1, 1, 0.015, 64);
    geo.scale(2.2, 1, 1.45);
    const mat = createFeltMaterial();
    return { geometry: geo, material: mat };
  }, []);

  return (
    <mesh geometry={geometry} material={material} position={[0, 0.008, 0]} receiveShadow />
  );
}

import { useMemo } from "react";
import * as THREE from "three";
import { createUnderbodyMaterial } from "../materials/metalMaterial";

/**
 * Elliptical table base — the structural underbody giving 3D thickness.
 * Not a flat disc — has visible depth and a premium silhouette.
 */
export function TableBase() {
  const { geometry, material } = useMemo(() => {
    // Elliptical cylinder: radiusTop, radiusBottom, height, radialSegments
    const geo = new THREE.CylinderGeometry(1, 1, 0.12, 64);
    // Scale to ellipse: wider on X than Z
    geo.scale(2.4, 1, 1.6);
    const mat = createUnderbodyMaterial();
    return { geometry: geo, material: mat };
  }, []);

  return (
    <group position={[0, -0.06, 0]}>
      <mesh geometry={geometry} material={material} receiveShadow />
    </group>
  );
}

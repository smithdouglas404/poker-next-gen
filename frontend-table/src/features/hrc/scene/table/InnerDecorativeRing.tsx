import { useMemo } from "react";
import * as THREE from "three";

/**
 * Inner decorative ring — subtle gold accent line on felt.
 */
export function InnerDecorativeRing() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.TorusGeometry(1, 0.008, 12, 96);
    geo.scale(2.04, 1, 1.34);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3d2e0a"),
      emissive: new THREE.Color("#d4af37"),
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.6,
    });
    return { geometry: geo, material: mat };
  }, []);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 0.215, 0]}
      rotation={[Math.PI / 2, 0, 0]}
    />
  );
}

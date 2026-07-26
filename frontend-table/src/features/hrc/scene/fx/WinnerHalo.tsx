import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Blueprint Section 5 — WinnerEffects / WinnerHalo
 * Gold glow effect on winning seat.
 * Emissive disc that pulses beneath the winning seat position.
 */

interface WinnerHaloProps {
  position: THREE.Vector3;
  active: boolean;
}

export function WinnerHalo({ position, active }: WinnerHaloProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.25, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#000000"),
      emissive: new THREE.Color("#f2c660"),
      emissiveIntensity: active ? 1.5 : 0,
      transparent: true,
      opacity: active ? 0.6 : 0,
      side: THREE.DoubleSide,
    });
    return { geometry: geo, material: mat };
  }, [active]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !active) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const t = clock.getElapsedTime();
    const pulse = Math.sin(t * 2) * 0.3 + 0.7;
    mat.emissiveIntensity = 1.0 + pulse;
    mat.opacity = 0.4 + pulse * 0.2;
  });

  if (!active) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[position.x, position.y - 0.01, position.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Blueprint Section 5 — PlayingCard3D
 * Slightly beveled, real shadow separation from table, clean casino-grade printing.
 * Uses SVG card textures from /cards/ when face-up.
 */

interface PlayingCard3DProps {
  rank?: string;
  suit?: string;
  faceUp?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

// Card dimensions (poker size ratio ~2.5:3.5)
const CARD_WIDTH = 0.16;
const CARD_HEIGHT = 0.23;
const CARD_DEPTH = 0.004;

export function PlayingCard3D({
  rank,
  suit,
  faceUp = true,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: PlayingCard3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(CARD_WIDTH, CARD_DEPTH, CARD_HEIGHT);
    return geo;
  }, []);

  // Face material — white with subtle bevel shadow
  const faceMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: faceUp ? new THREE.Color("#ffffff") : new THREE.Color("#1e3a5f"),
      roughness: faceUp ? 0.3 : 0.5,
      metalness: 0.0,
    });
  }, [faceUp]);

  // Back material — dark blue card back
  const backMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0d1b2a"),
      roughness: 0.5,
      metalness: 0.1,
      emissive: new THREE.Color("#58f1ff"),
      emissiveIntensity: 0.05,
    });
  }, []);

  // Edge material — thin dark edge
  const edgeMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d0d0d0"),
      roughness: 0.6,
      metalness: 0.0,
    });
  }, []);

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const materials = useMemo(() => {
    return [edgeMat, edgeMat, faceMat, backMat, edgeMat, edgeMat];
  }, [faceMat, backMat, edgeMat]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materials}
      position={position}
      rotation={[rotation[0] - Math.PI / 2, rotation[1], rotation[2]]}
      castShadow
      receiveShadow
    />
  );
}

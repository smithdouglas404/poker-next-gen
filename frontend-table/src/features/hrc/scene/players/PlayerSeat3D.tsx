import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/features/hrc/store/useGameStore";

/**
 * Blueprint Section 5 — PlayerSeat
 * Each player seat contains:
 * - avatar frame anchor (3D frame geometry)
 * - seat ring (handled by SeatRingGroup)
 * - local card anchor (position for hole cards)
 * - label anchor (position for DOM overlay — handled by PlayerLabelOverlay)
 * - action highlight anchor
 *
 * Avatar frames: from HTML — 98x98px, rounded-22px, cyan border with glow.
 * Rendered as 3D plane with border geometry.
 */

interface PlayerSeat3DProps {
  seatIndex: number;
  position: THREE.Vector3;
}

export function PlayerSeat3D({ seatIndex, position }: PlayerSeat3DProps) {
  const frameRef = useRef<THREE.Mesh>(null);
  const player = useGameStore((s) => s.players.find((p) => p.seatIndex === seatIndex));
  const currentTurnSeat = useGameStore((s) => s.currentTurnSeat);
  const isActive = currentTurnSeat === seatIndex;
  const isWinner = player?.result === "win";
  const isFolded = player?.status === "folded";

  // Avatar frame — 3D rounded rectangle border
  const { frameGeo, frameMat, backGeo, backMat } = useMemo(() => {
    // Frame border ring — larger to be visible from camera
    const fGeo = new THREE.RingGeometry(0.17, 0.19, 32);
    const fMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(isWinner ? "#3d2e0a" : "#2a2010"),
      emissive: new THREE.Color(isWinner ? "#f2c660" : "#d4af37"),
      emissiveIntensity: isActive ? 1.8 : isWinner ? 1.4 : 0.5,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: isFolded ? 0.25 : 0.9,
    });

    // Back panel (avatar background) — larger
    const bGeo = new THREE.PlaneGeometry(0.32, 0.32);
    const bMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#161d29"),
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: isFolded ? 0.2 : 0.85,
    });

    return { frameGeo: fGeo, frameMat: fMat, backGeo: bGeo, backMat: bMat };
  }, [isActive, isWinner, isFolded]);

  // Pulse animation for active seat
  useFrame(({ clock }) => {
    if (frameRef.current && isActive && !isWinner) {
      const mat = frameRef.current.material as THREE.MeshStandardMaterial;
      const pulse = Math.sin(clock.getElapsedTime() * 3) * 0.4 + 0.6;
      mat.emissiveIntensity = 1.0 + pulse;
    }
  });

  if (!player) return null;

  return (
    <group position={[position.x, position.y + 0.2, position.z]}>
      {/* Avatar back panel */}
      <mesh geometry={backGeo} material={backMat} rotation={[-Math.PI / 4, 0, 0]} />
      {/* Avatar border frame */}
      <mesh
        ref={frameRef}
        geometry={frameGeo}
        material={frameMat}
        rotation={[-Math.PI / 4, 0, 0]}
        position={[0, 0.001, 0]}
      />
    </group>
  );
}

/**
 * Group of all 10 player seats in 3D.
 */
interface PlayersGroupProps {
  seatPositions: THREE.Vector3[];
}

export function PlayersGroup({ seatPositions }: PlayersGroupProps) {
  return (
    <group>
      {seatPositions.map((pos, i) => (
        <PlayerSeat3D key={i} seatIndex={i} position={pos} />
      ))}
    </group>
  );
}

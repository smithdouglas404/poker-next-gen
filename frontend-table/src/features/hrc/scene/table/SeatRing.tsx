import { useMemo } from "react";
import * as THREE from "three";
import { createCyanEmissiveMaterial } from "../materials/metalMaterial";

/**
 * 10 cyan emissive seat positions evenly spaced around the table ellipse.
 * Each seat is a small torus (ring) that glows cyan.
 */

// Seat positions on ellipse perimeter — angles in radians, 0 = bottom center
function getSeatPositions(count: number, rx: number, rz: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    // Start from bottom (6 o'clock) and go clockwise
    const angle = (Math.PI / 2) + (2 * Math.PI * i) / count;
    const x = rx * Math.cos(angle);
    const z = rz * Math.sin(angle);
    positions.push(new THREE.Vector3(x, 0.03, z));
  }
  return positions;
}

interface SeatRingGroupProps {
  count?: number;
  activeSeat?: number;
  winnerSeat?: number;
}

export function SeatRingGroup({ count = 10, activeSeat, winnerSeat }: SeatRingGroupProps) {
  const positions = useMemo(() => getSeatPositions(count, 2.55, 1.68), [count]);

  const seatGeo = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.12, 0.012, 8, 24);
    return geo;
  }, []);

  const defaultMat = useMemo(() => createCyanEmissiveMaterial(0.6), []);
  const activeMat = useMemo(() => createCyanEmissiveMaterial(1.4), []);
  const winnerMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3d2e0a"),
      emissive: new THREE.Color("#f2c660"),
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.7,
    });
  }, []);

  return (
    <group>
      {positions.map((pos, i) => {
        const isActive = activeSeat === i;
        const isWinner = winnerSeat === i;
        const mat = isWinner ? winnerMat : isActive ? activeMat : defaultMat;

        return (
          <mesh
            key={i}
            geometry={seatGeo}
            material={mat}
            position={pos}
            rotation={[Math.PI / 2, 0, 0]}
          />
        );
      })}
    </group>
  );
}

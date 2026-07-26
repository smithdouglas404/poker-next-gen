import { useMemo } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { TableBase } from "../table/TableBase";
import { FeltSurface } from "../table/FeltSurface";
import { OuterMetalRing } from "../table/OuterMetalRing";
import { InnerGoldRing } from "../table/InnerGoldRing";
import { SeatRingGroup } from "../table/SeatRing";
import { PostFx } from "../fx/PostFx";
import { PlayersGroup } from "../players/PlayerSeat3D";
import { BoardCardsGroup } from "../cards/BoardCardsGroup";
import { PlayerLabelOverlay } from "../overlays/PlayerLabelOverlay";
import { PotOverlay } from "../overlays/PotOverlay";

/**
 * Scene graph root — orchestrates all 3D scene children.
 *
 * Lighting strategy:
 * - Warm overhead spotlight on felt center (primary illumination)
 * - Cool ambient fill (low intensity, prevents pure black)
 * - Hemisphere light for subtle sky/ground color differentiation
 * - Environment map for metallic reflections on rings
 */
interface SceneRootProps {
  quality?: "low" | "medium" | "high" | "cinematic";
  activeSeat?: number;
  winnerSeat?: number;
}

function getSeatPositions(count: number, rx: number, rz: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI / 2) + (2 * Math.PI * i) / count;
    positions.push(new THREE.Vector3(rx * Math.cos(angle), 0.03, rz * Math.sin(angle)));
  }
  return positions;
}

export function SceneRoot({ quality = "high", activeSeat, winnerSeat }: SceneRootProps) {
  const seatPositions = useMemo(() => getSeatPositions(10, 2.55, 1.68), []);

  return (
    <>
      <CameraRig />

      {/* ── Lighting ── */}

      {/* Warm overhead spotlight — primary felt illumination */}
      <spotLight
        position={[0, 6, 0]}
        angle={0.5}
        penumbra={0.8}
        intensity={2.5}
        color="#fff5e0"
        castShadow
        shadow-mapSize-width={quality === "low" ? 512 : 1024}
        shadow-mapSize-height={quality === "low" ? 512 : 1024}
        shadow-bias={-0.0005}
      />

      {/* Cool ambient fill — prevents pure black, adds depth */}
      <ambientLight intensity={0.15} color="#8ecbff" />

      {/* Hemisphere — subtle warm top / cool bottom separation */}
      <hemisphereLight
        args={["#1a1a30", "#050508", 0.25]}
      />

      {/* Rim accent lights — subtle cyan fill from the sides for metal response */}
      <pointLight position={[-4, 2, 0]} intensity={0.3} color="#58f1ff" distance={10} decay={2} />
      <pointLight position={[4, 2, 0]} intensity={0.3} color="#58f1ff" distance={10} decay={2} />

      {/* Warm fill from below for metal underside reflections */}
      <pointLight position={[0, -1, 0]} intensity={0.15} color="#1a1205" distance={8} />

      {/* ── Table Construction ── */}
      <group>
        <TableBase />
        <FeltSurface />
        <OuterMetalRing />
        <InnerGoldRing />
        <SeatRingGroup
          count={10}
          activeSeat={activeSeat}
          winnerSeat={winnerSeat}
        />
      </group>

      {/* ── Board card placeholder positions (5 spots at table center) ── */}
      <group position={[0, 0.025, 0]}>
        {[-0.48, -0.24, 0, 0.24, 0.48].map((xOff, i) => (
          <mesh key={`card-slot-${i}`} position={[xOff, 0, 0]}>
            <boxGeometry args={[0.18, 0.003, 0.26]} />
            <meshStandardMaterial
              color="#0d2818"
              transparent
              opacity={0.35}
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>

      {/* ── Player seats (3D avatars) ── */}
      <PlayersGroup seatPositions={seatPositions} />

      {/* ── Board cards (3D) ── */}
      <BoardCardsGroup />

      {/* ── HTML Overlays (anchored to 3D) ── */}
      <PlayerLabelOverlay seatPositions={seatPositions} />
      <PotOverlay />

      {/* ── Post-processing ── */}
      <PostFx quality={quality} />
    </>
  );
}

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { useGameStore, type PlayerState } from "@/features/hrc/store/useGameStore";

/**
 * HTML overlays anchored to each 3D seat position.
 * Shows player name, chip stack, and active-turn indicator.
 * Uses drei <Html> so labels track 3D world positions through the camera projection.
 */

function formatStack(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
}

interface PlayerLabelProps {
  player: PlayerState;
  position: THREE.Vector3;
  isActive: boolean;
  isWinner: boolean;
}

function PlayerLabel({ player, position, isActive, isWinner }: PlayerLabelProps) {
  const isFolded = player.status === "folded";

  const labelPos: [number, number, number] = [
    position.x,
    position.y + 0.05,
    position.z,
  ];

  const borderColor = isWinner
    ? "rgba(242, 198, 96, 0.9)"
    : isActive
      ? "rgba(88, 241, 255, 0.9)"
      : "rgba(255, 255, 255, 0.12)";

  const glowShadow = isWinner
    ? "0 0 12px rgba(242, 198, 96, 0.5)"
    : isActive
      ? "0 0 12px rgba(88, 241, 255, 0.4)"
      : "none";

  return (
    <Html
      position={labelPos}
      center
      distanceFactor={5}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          opacity: isFolded ? 0.35 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        {/* Name badge */}
        <div
          style={{
            background: "rgba(10, 14, 22, 0.88)",
            border: `1px solid ${borderColor}`,
            borderRadius: 6,
            padding: "3px 10px",
            boxShadow: glowShadow,
            whiteSpace: "nowrap",
            textAlign: "center",
            minWidth: 70,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isWinner ? "#f2c660" : "#e8eaed",
              lineHeight: "16px",
              letterSpacing: "0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 100,
            }}
          >
            {player.displayName}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: isWinner ? "#f2c660" : "#58f1ff",
              lineHeight: "14px",
            }}
          >
            {formatStack(player.stackCurrent)}
          </div>
        </div>

        {/* Win delta badge */}
        {isWinner && player.amountDelta > 0 && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#4ade80",
              textShadow: "0 0 6px rgba(74, 222, 128, 0.5)",
            }}
          >
            +{formatStack(player.amountDelta)}
          </div>
        )}

        {/* Hand label on showdown */}
        {isWinner && player.handLabel && (
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#f2c660",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {player.handLabel}
          </div>
        )}
      </div>
    </Html>
  );
}

interface PlayerLabelOverlayProps {
  seatPositions: THREE.Vector3[];
}

export function PlayerLabelOverlay({ seatPositions }: PlayerLabelOverlayProps) {
  const players = useGameStore((s) => s.players);
  const currentTurnSeat = useGameStore((s) => s.currentTurnSeat);

  const playersBySeat = useMemo(() => {
    const map = new Map<number, PlayerState>();
    for (const p of players) {
      map.set(p.seatIndex, p);
    }
    return map;
  }, [players]);

  return (
    <group>
      {seatPositions.map((pos, i) => {
        const player = playersBySeat.get(i);
        if (!player) return null;
        return (
          <PlayerLabel
            key={player.id}
            player={player}
            position={pos}
            isActive={currentTurnSeat === i}
            isWinner={player.result === "win"}
          />
        );
      })}
    </group>
  );
}

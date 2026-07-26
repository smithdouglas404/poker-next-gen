import { Html } from "@react-three/drei";
import { useGameStore } from "@/features/hrc/store/useGameStore";

/**
 * HTML overlay anchored to the table center showing the current pot amount.
 * Uses drei <Html> to project into the 3D scene at the pot position.
 */

function formatPot(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
}

export function PotOverlay() {
  const pot = useGameStore((s) => s.pot);
  const phase = useGameStore((s) => s.phase);

  if (!pot || pot <= 0 || phase === "waiting") return null;

  return (
    <Html
      position={[0, 0.06, -0.35]}
      center
      distanceFactor={5}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(10, 14, 22, 0.9)",
          border: "1px solid rgba(212, 175, 55, 0.5)",
          borderRadius: 8,
          padding: "4px 14px",
          boxShadow: "0 0 10px rgba(212, 175, 55, 0.25)",
          whiteSpace: "nowrap",
        }}
      >
        {/* Chip icon */}
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #f2c660 0%, #d4af37 100%)",
            border: "1.5px solid #c9942e",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#f2c660",
            letterSpacing: "0.03em",
            textShadow: "0 0 8px rgba(242, 198, 96, 0.3)",
          }}
        >
          {formatPot(pot)}
        </span>
      </div>
    </Html>
  );
}

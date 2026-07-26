// Avatar Status Ring — tier/streak/classification indicators
import type { AvatarOption } from "./AvatarSelect";

interface AvatarStatusRingProps {
  tier?: AvatarOption["tier"];
  winStreak?: number;
  vpipPercent?: number;
  size: number; // avatar size in px
  isActive?: boolean;
}

function getVpipClass(vpip: number): { label: string; icon: string } {
  if (vpip < 15) return { label: "Rock", icon: "\u{1FAA8}" }; // 🪨
  if (vpip <= 25) return { label: "TAG", icon: "\u{1F3AF}" }; // 🎯
  if (vpip <= 35) return { label: "LAG", icon: "\u26A1" }; // ⚡
  return { label: "Maniac", icon: "\u{1F525}" }; // 🔥
}

function getTierRingStyle(tier: AvatarOption["tier"], isActive: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    inset: "-8px",
    borderRadius: "14px",
    pointerEvents: "none",
    zIndex: 0,
  };

  switch (tier) {
    case "legendary":
      return {
        ...base,
        background: "conic-gradient(from 0deg, #ffd700, #f2c660, #d4af37, #8b6914, #ffd700)",
        opacity: isActive ? 1 : 0.7,
        padding: "2px",
      };
    case "epic":
      return {
        ...base,
        background: "conic-gradient(from 0deg, #b44dff, #8b2fd0, #d580ff, #b44dff)",
        opacity: isActive ? 1 : 0.6,
        padding: "2px",
      };
    case "rare":
      return {
        ...base,
        border: "2px solid #d4af37",
        boxShadow: "0 0 8px rgba(212,175,55,0.3), inset 0 0 4px rgba(212,175,55,0.1)",
        opacity: isActive ? 1 : 0.5,
      };
    default: // common
      return {
        ...base,
        border: "2px solid rgba(128,128,128,0.3)",
        opacity: isActive ? 0.5 : 0.25,
      };
  }
}

export function AvatarStatusRing({ tier = "common", winStreak = 0, vpipPercent, size, isActive = false }: AvatarStatusRingProps) {
  const ringStyle = getTierRingStyle(tier, isActive);
  const isGradientRing = tier === "legendary" || tier === "epic";
  const vpipInfo = vpipPercent !== undefined ? getVpipClass(vpipPercent) : null;

  return (
    <>
      {/* Tier ring */}
      {isGradientRing ? (
        <div style={ringStyle}>
          <div style={{
            width: "100%",
            height: "100%",
            borderRadius: "12px",
            background: "rgba(20,31,40,0.88)",
          }} />
        </div>
      ) : (
        <div style={ringStyle} />
      )}

      {/* Win streak badge — fire icon at 12 o'clock */}
      {winStreak >= 2 && (
        <div
          style={{
            position: "absolute",
            top: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 35,
            display: "flex",
            alignItems: "center",
            gap: "2px",
            padding: "1px 5px",
            borderRadius: "8px",
            background: "rgba(255,100,0,0.25)",
            border: "1px solid rgba(255,100,0,0.4)",
            fontSize: "0.5625rem",
            fontWeight: 700,
            color: "#ff6b35",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: "0.625rem" }}>{"\u{1F525}"}</span>
          {winStreak}
        </div>
      )}

      {/* VPIP classification badge at 6 o'clock */}
      {vpipInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "-10px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 35,
            display: "flex",
            alignItems: "center",
            gap: "2px",
            padding: "1px 4px",
            borderRadius: "6px",
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: "0.5rem",
            fontWeight: 700,
            color: "#a0a0a0",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: "0.5625rem" }}>{vpipInfo.icon}</span>
          {vpipInfo.label}
        </div>
      )}
    </>
  );
}

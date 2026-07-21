"use client";

import { useRef, useState, type PointerEvent } from "react";

import { avatarDef, avatarForKey, avatarGradient, avatarSrc } from "@/features/table/avatars";

/**
 * A 2.5D "living" character portrait for a table seat.
 *
 * Not a rigged 3D model — instead the 2D character art is presented with real CSS
 * 3D transforms (perspective + pointer-tracked tilt), depth (rim light + drop
 * shadow), an idle breathing float, and reaction states:
 *   - active : lifts + bobs + intensified neon glow (whose turn it is)
 *   - winner : celebratory pulse + gold sparkles
 *   - folded : desaturates, dims, and recedes in Z
 * This reads as a 3D character at the table and is a clear step beyond a flat
 * portrait card, using the art we already ship.
 */
export function Character3D({
  identity,
  name,
  hero,
  active,
  winner,
  folded,
  size = 56,
}: {
  identity: string;
  name?: string;
  hero: boolean;
  active?: boolean;
  winner?: boolean;
  folded?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const def = avatarDef(avatarForKey(identity));
  const ring = hero ? "#fbbf24" : def.border;
  const glow = hero ? "rgba(251,191,36,0.7)" : def.glow;
  const monogram = name?.slice(0, 2).toUpperCase() ?? "??";

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    // Tilt toward the pointer (max ~14°).
    setTilt({ rx: -py * 14, ry: px * 14 });
  };
  const onLeave = () => setTilt({ rx: 0, ry: 0 });

  // Reaction animation on the inner card.
  const anim = winner
    ? "seatWinPulse 0.9s ease-out"
    : active
      ? "seatTurnBob 1.6s ease-in-out infinite"
      : "seatIdleFloat 4s ease-in-out infinite";

  const lift = active || winner ? 10 : 0;

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{
        width: size,
        height: size,
        perspective: 420,
        opacity: folded ? 0.45 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: `translateZ(${folded ? -18 : lift}px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: "transform 0.15s ease-out",
          animation: folded ? "none" : anim,
          filter: folded ? "grayscale(0.85) brightness(0.7)" : "none",
        }}
      >
        {/* neon glow halo (sits behind, in depth) */}
        <div
          style={{
            position: "absolute",
            inset: -5,
            borderRadius: "9999px",
            background: glow,
            filter: `blur(${active || winner ? 12 : 7}px)`,
            transform: "translateZ(-12px)",
            transition: "filter 0.3s ease",
          }}
        />
        {/* the portrait */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "9999px",
            overflow: "hidden",
            boxShadow: `0 0 0 2px ${ring}, 0 10px 22px rgba(0,0,0,0.55), inset 0 2px 6px rgba(255,255,255,0.18)`,
          }}
        >
          {failed ? (
            <div
              className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
              style={{ background: avatarGradient(identity) }}
            >
              {monogram}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc(def.id)}
              alt={name ?? "player"}
              onError={() => setFailed(true)}
              className="h-full w-full object-cover"
              style={{ transform: "translateZ(6px)" }}
            />
          )}
          {/* rim light sweep for depth */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "9999px",
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.28), transparent 45%, transparent 70%, rgba(0,0,0,0.35))",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* win sparkles */}
        {winner && (
          <>
            <span style={sparkleStyle(-6, -4, "0s")} />
            <span style={sparkleStyle(size - 8, 2, "0.15s")} />
            <span style={sparkleStyle(size / 2, size - 6, "0.3s")} />
          </>
        )}
      </div>
    </div>
  );
}

function sparkleStyle(left: number, top: number, delay: string): React.CSSProperties {
  return {
    position: "absolute",
    left,
    top,
    width: 8,
    height: 8,
    borderRadius: "9999px",
    background: "radial-gradient(circle, #fde68a, rgba(253,230,138,0))",
    animation: `winSparkle 0.8s ease-out ${delay} forwards`,
    pointerEvents: "none",
  };
}

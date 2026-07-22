"use client";

// Reusable, prop-driven cinematic React-Three-Fiber poker table.
//
// This is the SINGLE source of the approved cinematic look — extracted verbatim
// from the proof (`src/app/proof/CinematicTable.tsx`) so that `/proof` (fed
// static PROOF_* data) and the live `/table` (fed authoritative Nakama state)
// render pixel-for-pixel the same scene. All design-system values (felt /
// gunmetal / gold / cyan, bloom intensity 0.55 threshold 0.55, camera
// [0,6.9,7.9] fov 42) are the binding contract in CLAUDE.md — do not "improve".

import * as THREE from "three";
import { Suspense, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, Html, useGLTF, Clone, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

import { cardFaceTexture, feltTexture } from "@/app/proof/textures";
import { avatarSrc } from "@/features/table/avatars";

const GLB_URL = "/models/house.glb";

/** Character/graphics preset the player selects (persisted in renderMode). */
export type AvatarMode = "2d" | "3d" | "mix";

export type SeatState = "idle" | "active" | "allin" | "folded" | "winner";

export interface SceneSeat {
  index: number;
  name: string;
  /** Pre-formatted stack label, e.g. "$52,500". */
  stack: string;
  /** Resolved neon ring hex (caller encodes state -> color). */
  ringColor: string;
  state: SeatState;
  action?: { label: string; amount?: string; tone: "fold" | "call" | "raise" | "allin" };
  hole?: [string, string];
  /** Portrait art id -> /avatars/<id>.webp (2.5D mode). */
  avatar?: string;
  /** Equipped GLB url (3D / mix mode). */
  model_url?: string;
  /** In "mix" mode, render this seat as a 3D GLB. */
  use3d?: boolean;
}

export interface CinematicSceneProps {
  seats: SceneSeat[];
  /** Community board as four-color card codes, e.g. ["As","Kd","7c"]. */
  board: string[];
  /** Pre-formatted pot label for the intrinsic center HUD. */
  potLabel: string;
  /** Hero hole cards for the intrinsic bottom HUD (null hides them). */
  heroHole: [string, string] | null;
  mode: AvatarMode;
  /** Seat-ring divisor: seats sit on `index / maxSeats` around the ellipse. */
  maxSeats: number;
  /** Whether the chip pot is present (hidden on an empty idle table). */
  showPot?: boolean;
  /**
   * Overlay layered on top of the canvas. When provided (the proof passes its
   * full showcase HUD), the intrinsic minimal HUD is suppressed so the proof
   * stays byte-identical. When omitted (the live table), the intrinsic HUD
   * renders the center pot label + hero hole cards.
   */
  children?: ReactNode;
  /**
   * Extra DOM overlay layered ON TOP of both the canvas and the intrinsic/
   * children HUD (never suppresses either). The live table passes its admin /
   * waiting-list / financial-summary chrome here so the pot + hero HUD survive.
   * Omitted by the proof, so its render stays byte-identical.
   */
  overlay?: ReactNode;
}

// Ellipse the seats sit on (matches the proof exactly).
const SX = 4.95;
const SZ = 3.2;
function seatPoint(index: number, total: number): [number, number, number] {
  const a = (index / total) * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(a) * SX, 0.12, Math.sin(a) * SZ];
}

/* ---------------- table geometry ---------------- */

function TableBody() {
  const felt = useMemo(() => feltTexture(), []);
  return (
    <group>
      {/* underbody */}
      <mesh position={[0, -0.55, 0]} scale={[5.9, 1, 4.1]}>
        <cylinderGeometry args={[1, 1.04, 1.05, 96]} />
        <meshStandardMaterial color="#0a0d12" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* felt top */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[5.35, 3.55, 1]} receiveShadow>
        <circleGeometry args={[1, 128]} />
        <meshStandardMaterial map={felt} roughness={0.92} metalness={0.02} />
      </mesh>

      {/* gold inner ring (flat) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} scale={[5.35, 3.55, 1]}>
        <ringGeometry args={[0.9, 0.94, 128]} />
        <meshStandardMaterial color="#f1cf6b" emissive="#8a6a1e" emissiveIntensity={0.5} metalness={1} roughness={0.28} side={THREE.DoubleSide} />
      </mesh>

      {/* cyan neon rim at felt edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={[5.55, 3.72, 1]}>
        <ringGeometry args={[0.985, 1.0, 160]} />
        <meshBasicMaterial color="#7fe9ff" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* gunmetal outer rail */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} scale={[5.62, 3.78, 1]}>
        <torusGeometry args={[1, 0.052, 24, 160]} />
        <meshStandardMaterial color="#171b22" metalness={0.95} roughness={0.32} />
      </mesh>
      {/* gold pinstripe on the rail */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.115, 0]} scale={[5.5, 3.68, 1]}>
        <torusGeometry args={[1, 0.012, 16, 160]} />
        <meshStandardMaterial color="#e9c46a" emissive="#6b501a" emissiveIntensity={0.35} metalness={1} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ---------------- cards ---------------- */

function BoardCard({ code, x }: { code: string; x: number }) {
  const face = useMemo(() => cardFaceTexture(code), [code]);
  const mats = useMemo(() => {
    const white = new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ map: face, roughness: 0.42, emissive: new THREE.Color("#ffffff"), emissiveMap: face, emissiveIntensity: 0.14 });
    // BoxGeometry face order: px, nx, py, ny, pz, nz  (py = top)
    return [white, white, top, white, white, white];
  }, [face]);
  return (
    <mesh position={[x, 0.075, -0.15]} rotation={[0, 0, 0]} castShadow material={mats}>
      <boxGeometry args={[0.66, 0.03, 0.92]} />
    </mesh>
  );
}

function Board({ board }: { board: string[] }) {
  const start = -((board.length - 1) / 2) * 0.86;
  return (
    <group>
      {board.map((c, i) => (
        <BoardCard key={`${c}-${i}`} code={c} x={start + i * 0.86} />
      ))}
    </group>
  );
}

/* ---------------- chips ---------------- */

function ChipStack({ position, color, count }: { position: [number, number, number]; color: string; count: number }) {
  const chips = [];
  for (let i = 0; i < count; i++) {
    chips.push(
      <mesh key={i} position={[0, i * 0.032, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.03, 40]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.5} />
      </mesh>,
    );
  }
  return <group position={position}>{chips}</group>;
}

function Pot() {
  return (
    <group position={[0, 0.05, 1.55]}>
      <ChipStack position={[-0.32, 0, 0]} color="#c9302c" count={7} />
      <ChipStack position={[0, 0, 0.05]} color="#1f2937" count={11} />
      <ChipStack position={[0.32, 0, 0]} color="#2f6bff" count={6} />
      <ChipStack position={[0.02, 0, -0.42]} color="#e9c46a" count={9} />
      <ChipStack position={[-0.34, 0, -0.4]} color="#1fa85a" count={5} />
    </group>
  );
}

/* ---------------- avatars ---------------- */

function SeatPill({ seat }: { seat: SceneSeat }) {
  const dim = seat.state === "folded";
  return (
    <div style={{ width: 132, transform: "translateY(6px)", opacity: dim ? 0.5 : 1, pointerEvents: "none" }} className="flex flex-col items-center gap-1">
      <div
        className="rounded-md px-2 py-0.5 text-center"
        style={{ background: "rgba(8,10,14,0.82)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(6px)" }}
      >
        <div className="text-[11px] font-semibold leading-tight text-white">{seat.name}</div>
        <div className="text-[11px] font-bold leading-tight" style={{ color: "#f3c14b" }}>{seat.stack}</div>
      </div>
      {seat.action && <ActionChip action={seat.action} />}
    </div>
  );
}

function ActionChip({ action }: { action: NonNullable<SceneSeat["action"]> }) {
  const tone = {
    fold: { bg: "rgba(60,20,24,0.9)", bd: "#c9302c", fg: "#ff9aa0" },
    call: { bg: "rgba(6,32,42,0.9)", bd: "#22d3ee", fg: "#9be9ff" },
    raise: { bg: "rgba(44,34,8,0.92)", bd: "#e9c46a", fg: "#ffe6a3" },
    allin: { bg: "rgba(60,10,14,0.95)", bd: "#ff3b46", fg: "#ff7a82" },
  }[action.tone];
  return (
    <div className="rounded-full px-2.5 py-[3px] text-[10px] font-bold tracking-wide" style={{ background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg, boxShadow: `0 0 12px ${tone.bd}55` }}>
      {action.label}{action.amount ? ` ${action.amount}` : ""}
    </div>
  );
}

function SeatPortrait2D({ seat, total }: { seat: SceneSeat; total: number }) {
  const p = seatPoint(seat.index, total);
  const ringColor = seat.ringColor;
  const glow = seat.state === "active" ? "rgba(243,193,75,0.75)" : seat.state === "allin" ? "rgba(255,59,70,0.7)" : "rgba(124,233,255,0.55)";
  const src = seat.avatar ? avatarSrc(seat.avatar) : avatarSrc("neon-viper");
  return (
    <Html position={[p[0], 0.35, p[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="flex flex-col items-center">
        <div style={{ position: "relative", opacity: seat.state === "folded" ? 0.55 : 1 }}>
          <div
            style={{
              width: 104, height: 104, borderRadius: "50%", overflow: "hidden",
              border: `3px solid ${ringColor}`,
              boxShadow: `0 0 30px ${glow}, 0 0 0 2px rgba(212,175,55,0.35), inset 0 0 12px rgba(0,0,0,0.55)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" width={104} height={104} style={{ objectFit: "cover", display: "block", imageRendering: "auto" }} />
          </div>
          {/* owned badge */}
          <div
            style={{
              position: "absolute", right: -2, bottom: 16, width: 22, height: 22, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
              background: "linear-gradient(180deg,#f3e2ad,#d4af37)", color: "#3a2c07",
              border: "1.5px solid rgba(0,0,0,0.4)", boxShadow: "0 0 10px rgba(212,175,55,0.6)",
            }}
            title="Owned avatar"
          >★</div>
        </div>
        <SeatPill seat={seat} />
      </div>
    </Html>
  );
}

/** A dark gunmetal + neon-piped chair the 3D figure sits in — sells the
 *  "seated full body" read of the full_body_avatar master (figures at the rail,
 *  not floating busts). Pure R3F geometry (non-negotiable #1). */
function SeatChair({ ring }: { ring: string }) {
  return (
    <group>
      {/* seat pad */}
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.86, 0.14, 0.82]} />
        <meshStandardMaterial color="#12161d" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* backrest, tilted back slightly, sitting behind the figure (−z local) */}
      <mesh position={[0, 0.86, -0.42]} rotation={[-0.14, 0, 0]} castShadow>
        <boxGeometry args={[0.82, 0.96, 0.12]} />
        <meshStandardMaterial color="#171b22" metalness={0.85} roughness={0.36} />
      </mesh>
      {/* neon rim piping along the top of the backrest — state-colored glow */}
      <mesh position={[0, 1.32, -0.46]} rotation={[-0.14, 0, 0]}>
        <boxGeometry args={[0.82, 0.05, 0.06]} />
        <meshBasicMaterial color={ring} toneMapped={false} />
      </mesh>
      {/* pedestal base */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 0.28, 20]} />
        <meshStandardMaterial color="#0c0f14" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

function GlbFigure({ seat, total }: { seat: SceneSeat; total: number }) {
  const p = seatPoint(seat.index, total);
  const gltf = useGLTF(seat.model_url ?? GLB_URL);
  // face the table center
  const yaw = Math.atan2(-p[0], -p[2]);
  const dim = seat.state === "folded";
  // Push the figure a touch further out onto the rail and render it larger so it
  // reads as a full seated body (torso + lap at the felt) rather than a bust.
  const fx = p[0] * 1.14;
  const fz = p[2] * 1.14;
  return (
    <group>
      <group position={[fx, 0.0, fz]} rotation={[0, yaw, 0]}>
        <SeatChair ring={seat.ringColor} />
        {/* seated figure: larger scale, hips at the seat pad so the lap sits at
            felt height and the head clears the rail — a fuller HRC-style body. */}
        <group position={[0, 0.24, 0.06]} scale={1.28}>
          <Clone object={gltf.scene} castShadow />
        </group>
      </group>
      <Html position={[p[0], 0.55, p[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", opacity: dim ? 0.5 : 1 }}>
        <SeatPill seat={seat} />
      </Html>
    </group>
  );
}

/* ---------------- scene ---------------- */

function Scene({ seats, board, mode, maxSeats, showPot }: {
  seats: SceneSeat[];
  board: string[];
  mode: AvatarMode;
  maxSeats: number;
  showPot: boolean;
}) {
  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 12, 26]} />

      <ambientLight intensity={0.35} color="#6a86b8" />
      <hemisphereLight intensity={0.45} color="#2a4d78" groundColor="#08170f" />
      <spotLight position={[0, 9.5, 2.5]} angle={0.62} penumbra={0.9} intensity={2.6} color="#fff4d8" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-7.5, 3.2, -3]} intensity={2.2} decay={0} color="#38e6ff" />
      <pointLight position={[7.5, 3.2, -2]} intensity={2.0} decay={0} color="#ffcf6a" />
      <pointLight position={[0, 2.4, -7.5]} intensity={1.3} decay={0} color="#b44dff" />

      <Environment resolution={128}>
        <Lightformer intensity={1.4} form="rect" position={[0, 6, 1]} scale={[9, 4, 1]} color="#ffffff" />
        <Lightformer intensity={2.2} form="rect" position={[-6, 2, -3]} scale={[3, 6, 1]} color="#38e6ff" />
        <Lightformer intensity={2.0} form="rect" position={[6, 2, -3]} scale={[3, 6, 1]} color="#ffcf6a" />
      </Environment>

      <TableBody />
      <Board board={board} />
      {showPot && <Pot />}

      {/* dealer button */}
      <mesh position={[1.1, 0.09, 2.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 32]} />
        <meshStandardMaterial color="#f5f5f5" metalness={0.2} roughness={0.5} />
      </mesh>

      {seats.map((s) => {
        const is3d = mode === "3d" || (mode === "mix" && s.use3d);
        return is3d ? (
          <Suspense key={s.index} fallback={null}>
            <GlbFigure seat={s} total={maxSeats} />
          </Suspense>
        ) : (
          <SeatPortrait2D key={s.index} seat={s} total={maxSeats} />
        );
      })}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={16} blur={2.4} far={5} resolution={512} color="#000000" />

      <EffectComposer>
        <Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette eskil={false} offset={0.28} darkness={0.82} />
      </EffectComposer>
    </>
  );
}

/* ---------------- intrinsic minimal HUD (live only) ---------------- */

function HeroCard({ code }: { code: string }) {
  const rank = code.slice(0, -1).toUpperCase();
  const suit = code.slice(-1);
  const glyph = suit === "h" ? "♥" : suit === "s" ? "♠" : suit === "d" ? "♦" : "♣";
  const color = suit === "h" ? "#e5484d" : suit === "s" ? "#101317" : suit === "d" ? "#2f6bff" : "#1fa85a";
  return (
    <div className="relative flex h-[86px] w-[62px] flex-col justify-between rounded-lg bg-white p-1.5 shadow-lg" style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 18px rgba(127,233,255,0.25)" }}>
      <span className="text-lg font-bold leading-none" style={{ color }}>{rank}{glyph}</span>
      <span className="self-end text-2xl leading-none" style={{ color }}>{glyph}</span>
    </div>
  );
}

function SceneHud({ potLabel, heroHole }: { potLabel: string; heroHole: [string, string] | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {potLabel && (
        <div className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pot</div>
          <div className="text-xl font-bold" style={{ color: "#ffe6a3", textShadow: "0 0 16px rgba(233,196,106,0.6)" }}>{potLabel}</div>
        </div>
      )}
      {heroHole && (
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-end gap-2">
          {heroHole.map((c, i) => <HeroCard key={`${c}-${i}`} code={c} />)}
        </div>
      )}
    </div>
  );
}

/* ---------------- root ---------------- */

export function CinematicScene({
  seats,
  board,
  potLabel,
  heroHole,
  mode,
  maxSeats,
  showPot = true,
  children,
  overlay,
}: CinematicSceneProps) {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% 0%, rgba(56,230,255,0.10), transparent 60%)," +
          "radial-gradient(1000px 600px at 85% 20%, rgba(180,77,255,0.10), transparent 60%)," +
          "radial-gradient(900px 500px at 50% 100%, rgba(233,196,106,0.08), transparent 60%)," +
          "linear-gradient(180deg,#04060a,#070b12 60%,#04060a)",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 6.9, 7.9], fov: 42 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <Suspense fallback={null}>
          <Scene seats={seats} board={board} mode={mode} maxSeats={maxSeats} showPot={showPot} />
        </Suspense>
      </Canvas>
      {children ?? <SceneHud potLabel={potLabel} heroHole={heroHole} />}
      {overlay}
    </div>
  );
}

useGLTF.preload(GLB_URL);

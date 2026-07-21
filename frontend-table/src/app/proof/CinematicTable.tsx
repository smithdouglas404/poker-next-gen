"use client";

import * as THREE from "three";
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, Html, useGLTF, Clone, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

import { GLASS_PANEL } from "@/features/ui/tokens";
import { PROOF_SEATS, PROOF_BOARD, PROOF_HERO_HOLE, POT_LABEL, type ProofSeat } from "./proofData";
import { cardFaceTexture, feltTexture } from "./textures";
import { avatarSrc } from "@/features/table/avatars";

const GLB_URL = "/models/house.glb";

// Ellipse the seats sit on.
const SX = 4.95;
const SZ = 3.2;
function seatPoint(index: number): [number, number, number] {
  const a = (index / PROOF_SEATS.length) * Math.PI * 2 + Math.PI / 2;
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

function Board() {
  const start = -((PROOF_BOARD.length - 1) / 2) * 0.86;
  return (
    <group>
      {PROOF_BOARD.map((c, i) => (
        <BoardCard key={c} code={c} x={start + i * 0.86} />
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

function SeatPill({ seat }: { seat: ProofSeat }) {
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

function ActionChip({ action }: { action: NonNullable<ProofSeat["action"]> }) {
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

function SeatPortrait2D({ seat }: { seat: ProofSeat }) {
  const p = seatPoint(seat.index);
  const ringColor = seat.state === "active" ? "#f3c14b" : seat.state === "allin" ? "#ff3b46" : seat.state === "folded" ? "#3a4250" : seat.ring;
  const glow = seat.state === "active" ? "rgba(243,193,75,0.75)" : seat.state === "allin" ? "rgba(255,59,70,0.7)" : "rgba(124,233,255,0.55)";
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
            <img src={avatarSrc(seat.avatar)} alt="" width={104} height={104} style={{ objectFit: "cover", display: "block", imageRendering: "auto" }} />
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

function GlbFigure({ seat }: { seat: ProofSeat }) {
  const p = seatPoint(seat.index);
  const gltf = useGLTF(seat.model ?? GLB_URL);
  // face the table center
  const yaw = Math.atan2(-p[0], -p[2]);
  const dim = seat.state === "folded";
  return (
    <group>
      <group position={[p[0] * 1.05, 0.0, p[2] * 1.05]} rotation={[0, yaw, 0]} scale={0.82}>
        <Clone object={gltf.scene} castShadow />
      </group>
      <Html position={[p[0], 0.55, p[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", opacity: dim ? 0.5 : 1 }}>
        <SeatPill seat={seat} />
      </Html>
    </group>
  );
}

/* ---------------- scene ---------------- */

type AvatarMode = "2d" | "3d" | "mix";

function Scene({ mode }: { mode: AvatarMode }) {
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
      <Board />
      <Pot />

      {/* dealer button */}
      <mesh position={[1.1, 0.09, 2.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 32]} />
        <meshStandardMaterial color="#f5f5f5" metalness={0.2} roughness={0.5} />
      </mesh>

      {PROOF_SEATS.map((s) => {
        const is3d = mode === "3d" || (mode === "mix" && s.use3d);
        return is3d ? (
          <Suspense key={s.index} fallback={null}>
            <GlbFigure seat={s} />
          </Suspense>
        ) : (
          <SeatPortrait2D key={s.index} seat={s} />
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

/* ---------------- DOM HUD ---------------- */

function HeroCard({ code }: { code: string }) {
  const rank = code.slice(0, -1).toUpperCase();
  const suit = code.slice(-1);
  const red = suit === "h";
  const glyph = suit === "h" ? "♥" : suit === "s" ? "♠" : suit === "d" ? "♦" : "♣";
  const color = suit === "h" ? "#e5484d" : suit === "s" ? "#101317" : suit === "d" ? "#2f6bff" : "#1fa85a";
  return (
    <div className="relative flex h-[86px] w-[62px] flex-col justify-between rounded-lg bg-white p-1.5 shadow-lg" style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 18px rgba(127,233,255,0.25)" }}>
      <span className="text-lg font-bold leading-none" style={{ color }}>{rank}{glyph}</span>
      <span className="self-end text-2xl leading-none" style={{ color }}>{glyph}</span>
      <span className="sr-only">{red}</span>
    </div>
  );
}

function HudOverlay({ mode }: { mode: AvatarMode }) {
  const badge = mode === "2d" ? "2.5D · HRC Portrait Avatars" : mode === "3d" ? "3D · GLB Avatars (Tripo pipeline)" : "Mixed · Tripo 3D + HRC portraits";
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* top-left table info */}
      <div className={`absolute left-5 top-5 ${GLASS_PANEL} px-4 py-3`} style={{ minWidth: 190 }}>
        <div className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "#7fe9ff" }}>High Rollers Main</div>
        <div className="mt-0.5 text-sm font-semibold text-white">$5 / $10 · No-Limit Hold&apos;em</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
          <span>Round: <span className="text-white/90">River</span></span>
          <span>·</span>
          <span>Hand #12,847</span>
        </div>
      </div>

      {/* top-right chat */}
      <div className={`absolute right-5 top-5 ${GLASS_PANEL} px-3.5 py-3`} style={{ width: 210 }}>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Table Chat</div>
        <div className="space-y-1 text-[11px] leading-snug">
          <div><span style={{ color: "#7fe9ff" }}>NeonViper:</span> <span className="text-white/70">nice pot building</span></div>
          <div><span style={{ color: "#e9c46a" }}>IceQueen:</span> <span className="text-white/70">gg well played 🎲</span></div>
          <div><span style={{ color: "#b44dff" }}>ShadowKing:</span> <span className="text-white/70">all day 🔥</span></div>
        </div>
        <div className="mt-2 rounded-md px-2 py-1 text-[11px] text-white/40" style={{ background: "rgba(255,255,255,0.04)" }}>Type a message…</div>
      </div>

      {/* bottom-left tournament stats */}
      <div className={`absolute bottom-6 left-5 ${GLASS_PANEL} px-4 py-3`} style={{ width: 200 }}>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Tournament Stats</div>
        {[["Live Stack", "$52,500"], ["Pot", POT_LABEL], ["Players Left", "6 / 9"], ["Blinds", "$5 / $10"]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-[3px] text-[11px]">
            <span className="text-white/55">{k}</span>
            <span className="font-semibold text-white/90">{v}</span>
          </div>
        ))}
      </div>

      {/* bottom-right player analytics */}
      <div className={`absolute bottom-5 right-5 ${GLASS_PANEL} px-4 py-3`} style={{ width: 200 }}>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Player Analytics</div>
        {[["Neon Viper", 68, "#22d3ee"], ["Shadow King", 41, "#e9c46a"], ["Void Witch", 92, "#ff3b46"]].map(([n, pct, c]) => (
          <div key={n as string} className="mb-2">
            <div className="mb-0.5 flex justify-between text-[11px]"><span className="text-white/70">{n}</span><span className="text-white/50">{pct}% VPIP</span></div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: c as string, boxShadow: `0 0 8px ${c}` }} />
            </div>
          </div>
        ))}
      </div>

      {/* pot label */}
      <div className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pot</div>
        <div className="text-xl font-bold" style={{ color: "#ffe6a3", textShadow: "0 0 16px rgba(233,196,106,0.6)" }}>{POT_LABEL}</div>
      </div>

      {/* action bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="mb-2 flex items-end justify-center gap-2">
          {PROOF_HERO_HOLE.map((c) => <HeroCard key={c} code={c} />)}
        </div>

        {/* pre-action toggles */}
        <div className="mb-2 flex justify-center gap-2">
          {[["Check / Fold", true], ["Call Any", false], ["Fold to Any", false]].map(([label, on]) => (
            <div
              key={label as string}
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={
                on
                  ? { background: "rgba(56,230,255,0.16)", border: "1px solid #22d3ee", color: "#bff0ff" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.6)" }
              }
            >
              {label}
            </div>
          ))}
        </div>

        <div className={`${GLASS_PANEL} px-3 py-2.5`} style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.55)" }}>
          <div className="flex items-center gap-2">
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(180deg,#b33,#7a1f1f)", border: "1px solid #d9534f" }}>FOLD</button>
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: "linear-gradient(180deg,#0e4a5c,#0a3340)", border: "1px solid #22d3ee", color: "#bff0ff" }}>CHECK / CALL <span className="opacity-80">$1,500</span></button>
            <button className="rounded-lg px-6 py-2.5 text-sm font-bold text-black" style={{ background: "linear-gradient(180deg,#f3e2ad,#d4af37 55%,#9a7b2c)", border: "1px solid #f3e2ad" }}>RAISE <span>$1,200</span></button>
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: "rgba(60,10,14,0.6)", border: "1px solid #ff3b46", color: "#ff9aa0" }}>ALL-IN</button>
          </div>

          {/* raise slider + presets */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex gap-1.5">
              {["Min", "½ Pot", "⅔ Pot", "Pot", "Max"].map((p, i) => (
                <div key={p} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={i === 2 ? { background: "linear-gradient(180deg,#f3e2ad,#d4af37)", color: "#3a2c07" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>{p}</div>
              ))}
            </div>
            <input type="range" min={0} max={100} defaultValue={44} className="h-1.5 flex-1 accent-amber-400" readOnly />
            <div className="rounded-md px-3 py-1 text-sm font-bold" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(212,175,55,0.5)", color: "#ffe6a3", minWidth: 84, textAlign: "center" }}>$1,200</div>
          </div>
        </div>
      </div>

      {/* mode badge */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ background: "rgba(8,10,14,0.7)", border: "1px solid rgba(127,233,255,0.4)", color: "#7fe9ff" }}>
        {badge}
      </div>
    </div>
  );
}

/* ---------------- root ---------------- */

export default function CinematicTable({ mode }: { mode: AvatarMode }) {
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
          <Scene mode={mode} />
        </Suspense>
      </Canvas>
      <HudOverlay mode={mode} />
    </div>
  );
}

useGLTF.preload(GLB_URL);

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
import { Suspense, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
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
  /** AI seat — badged "BOT" for every player. */
  isBot?: boolean;
  /** This seat holds the dealer button — render the "D" marker. */
  isButton?: boolean;
  /** Chips committed on the current street, pre-formatted (e.g. "$400"); shown as
   *  a bet chip in front of the seat. Absent when the seat has no live bet. */
  betLabel?: string;
  /** Raw committed-bet minor units — sizes the physical bet chip stack on the
   *  felt in front of the seat (0/undefined => no chips). */
  betMinor?: number;
  /** Raw stack minor units — sizes the player's physical chip pile beside the seat. */
  stackMinor?: number;
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
  /** A hand is in progress — draw face-down hole cards in front of each in-hand
   *  seat and show the deck. Off between hands (empty felt). */
  handLive?: boolean;
  /** Changes each new hand (the hand number) — triggers the deck's shuffle riffle. */
  dealNonce?: number;
  /** Raw pot minor units — scales the central pot chip pile. */
  potMinor?: number;
  /** Scene index of the winning seat at showdown (-1 = none) — the pot sweeps here. */
  winnerSeat?: number;
  /** Changes when a showdown result lands — triggers the pot→winner chip sweep. */
  winNonce?: number;
  /** Transient table announcement (winner, all-in, blinds up, host message)
   *  shown as a center-top banner over the felt. Empty/undefined hides it. */
  announce?: string;
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

      {/* red neon rim at felt edge (GGPoker brand glow) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={[5.55, 3.72, 1]}>
        <ringGeometry args={[0.985, 1.0, 160]} />
        <meshBasicMaterial color="#ff2d3f" side={THREE.DoubleSide} toneMapped={false} />
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

// Where the deck sits (dealer's right, off the board). Cards deal-in FROM here.
const DECK_POS: [number, number, number] = [2.95, 0.09, -0.15];

// useDealIn animates a group from the deck to `target`, easing out over ~0.42s
// after `delayMs`, so a freshly-mounted card flies to its slot. `flip` also turns
// the card face-up (board reveal). Everything settles to the static target, so if
// the timing is ever off the card still ends in exactly its resting place.
function useDealIn(target: [number, number, number], delayMs: number, flip = false) {
  const ref = useRef<THREE.Group>(null);
  const startRef = useRef<number | null>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const now = state.clock.getElapsedTime() * 1000;
    if (startRef.current === null) startRef.current = now + delayMs;
    const local = now - startRef.current;
    if (local < 0) {
      g.position.set(DECK_POS[0], DECK_POS[1], DECK_POS[2]);
      g.rotation.set(flip ? -Math.PI / 2 : 0, g.rotation.y, 0);
      g.scale.setScalar(0.86);
      return;
    }
    const DUR = 420;
    const k = Math.min(1, local / DUR);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    g.position.set(
      DECK_POS[0] + (target[0] - DECK_POS[0]) * e,
      DECK_POS[1] + (target[1] - DECK_POS[1]) * e + Math.sin(k * Math.PI) * 0.25, // slight arc
      DECK_POS[2] + (target[2] - DECK_POS[2]) * e,
    );
    if (flip) g.rotation.x = -Math.PI / 2 * (1 - e);
    g.scale.setScalar(0.86 + 0.14 * e);
  });
  return ref;
}

// Face-down card back — GGPoker dark-red with a gold rim. Used for the deck and
// every opponent's hole cards (the hero's real cards are the DOM overlay).
function CardBack({ w = 0.44, h = 0.62 }: { w?: number; h?: number }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[w, 0.02, h]} />
        <meshStandardMaterial color="#6f1420" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.011, 0]}>
        <boxGeometry args={[w * 0.82, 0.006, h * 0.86]} />
        <meshStandardMaterial color="#e9c46a" emissive="#8a6a1e" emissiveIntensity={0.35} metalness={0.9} roughness={0.35} />
      </mesh>
    </group>
  );
}

// The deck by the dealer — a neat stack of thin cards with a card-back top. Riffle-
// wiggles for ~0.5s whenever `nonce` (the hand number) changes: the visible shuffle.
function Deck({ nonce }: { nonce: number }) {
  const ref = useRef<THREE.Group>(null);
  const prev = useRef(nonce);
  const animAt = useRef<number | null>(null);
  useFrame((state) => {
    const now = state.clock.getElapsedTime() * 1000;
    if (nonce !== prev.current) {
      prev.current = nonce;
      animAt.current = now;
    }
    const g = ref.current;
    if (!g) return;
    if (animAt.current === null) return;
    const local = now - animAt.current;
    const DUR = 520;
    if (local > DUR) {
      animAt.current = null;
      g.rotation.z = 0;
      g.position.set(DECK_POS[0], DECK_POS[1], DECK_POS[2]);
      return;
    }
    const k = local / DUR;
    g.rotation.z = Math.sin(k * Math.PI * 3) * 0.22;
    g.position.set(DECK_POS[0], DECK_POS[1] + Math.sin(k * Math.PI) * 0.14, DECK_POS[2]);
  });
  const chips = [];
  for (let i = 0; i < 10; i++) {
    chips.push(
      <mesh key={i} position={[0, i * 0.02, 0]} castShadow>
        <boxGeometry args={[0.44, 0.02, 0.62]} />
        <meshStandardMaterial color={i === 9 ? "#6f1420" : "#f4f6f8"} roughness={0.5} />
      </mesh>,
    );
  }
  return (
    <group ref={ref} position={DECK_POS} rotation={[0, -0.3, 0]}>
      {chips}
    </group>
  );
}

// Two face-down hole cards dealt in front of a seated, in-hand player (opponents;
// the hero also gets backs on the felt while seeing their real cards in the DOM).
function SeatHoleCards({ seat, total }: { seat: SceneSeat; total: number }) {
  const p = seatPoint(seat.index, total);
  const len = Math.hypot(p[0], p[2]) || 1;
  const ux = p[0] / len;
  const uz = p[2] / len;
  const perpX = -uz; // tangent, to fan the two cards side by side
  const perpZ = ux;
  const base = 0.74; // in front of the seat, toward center
  const bx = p[0] * base;
  const bz = p[2] * base;
  const yaw = Math.atan2(-p[0], -p[2]);
  const ref0 = useDealIn([bx - perpX * 0.13, 0.055, bz - perpZ * 0.13], seat.index * 100);
  const ref1 = useDealIn([bx + perpX * 0.13, 0.055, bz + perpZ * 0.13], seat.index * 100 + 55);
  return (
    <>
      <group ref={ref0}>
        <group rotation={[0, yaw + 0.12, 0]}>
          <CardBack />
        </group>
      </group>
      <group ref={ref1}>
        <group rotation={[0, yaw - 0.12, 0]}>
          <CardBack />
        </group>
      </group>
    </>
  );
}

function BoardCard({ code, x, delay }: { code: string; x: number; delay: number }) {
  const face = useMemo(() => cardFaceTexture(code), [code]);
  const mats = useMemo(() => {
    const white = new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ map: face, roughness: 0.42, emissive: new THREE.Color("#ffffff"), emissiveMap: face, emissiveIntensity: 0.14 });
    // BoxGeometry face order: px, nx, py, ny, pz, nz  (py = top)
    return [white, white, top, white, white, white];
  }, [face]);
  const ref = useDealIn([x, 0.075, -0.15], delay, true);
  return (
    <group ref={ref}>
      <mesh castShadow material={mats}>
        <boxGeometry args={[0.66, 0.03, 0.92]} />
      </mesh>
    </group>
  );
}

function Board({ board }: { board: string[] }) {
  const start = -((board.length - 1) / 2) * 0.86;
  return (
    <group>
      {board.map((c, i) => (
        <BoardCard key={`${c}-${i}`} code={c} x={start + i * 0.86} delay={i * 130} />
      ))}
    </group>
  );
}

/* ---------------- chips ---------------- */

function ChipStack({
  position,
  color,
  count,
  radius = 0.16,
}: {
  position: [number, number, number];
  color: string;
  count: number;
  radius?: number;
}) {
  const chips = [];
  for (let i = 0; i < count; i++) {
    chips.push(
      <mesh key={i} position={[0, i * 0.026, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, 0.024, 32]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.5} />
      </mesh>,
    );
  }
  return <group position={position}>{chips}</group>;
}

// Where the central pot sits (chips + the DOM pot label ride here).
const POT_POS: [number, number, number] = [0, 0.05, 1.5];

// Central pot pile — a tight cluster of colored stacks just below the board whose
// heights now SCALE with the pot value (bigger pot → taller stacks), clamped so it
// still reads as a neat pot, not an oversized tower.
function Pot({ potMinor }: { potMinor: number }) {
  // Multiplier vs the baseline counts; ~1 at a mid pot, up to ~2.4 at a big one.
  const m = Math.max(0.5, Math.min(2.4, (potMinor || 0) / 60000));
  const c = (base: number) => Math.max(1, Math.round(base * m));
  return (
    <group position={POT_POS}>
      <ChipStack position={[-0.19, 0, 0]} color="#c9302c" count={c(4)} />
      <ChipStack position={[0, 0, 0.03]} color="#1f2937" count={c(6)} />
      <ChipStack position={[0.19, 0, 0]} color="#2f6bff" count={c(3)} />
      <ChipStack position={[0.01, 0, -0.24]} color="#e9c46a" count={c(5)} />
      <ChipStack position={[-0.2, 0, -0.23]} color="#1fa85a" count={c(3)} />
    </group>
  );
}

// A player's own chip pile beside their seat, sized to their stack. Two adjacent
// stacks (steel + gold) so it reads as real chips, not the text-only stack label.
function SeatStackChips({ seat, total }: { seat: SceneSeat; total: number }) {
  if (!seat.stackMinor || seat.stackMinor <= 0) return null;
  const p = seatPoint(seat.index, total);
  const len = Math.hypot(p[0], p[2]) || 1;
  const perpX = -p[2] / len;
  const perpZ = p[0] / len;
  // Just in front of the seat, offset to the side so it clears the hole cards.
  const base = 0.92;
  const cx = p[0] * base + perpX * 0.52;
  const cz = p[2] * base + perpZ * 0.52;
  const n = Math.max(3, Math.min(16, Math.round(seat.stackMinor / 15000)));
  const half = Math.ceil(n / 2);
  return (
    <group position={[cx, 0.05, cz]}>
      <ChipStack position={[-0.075, 0, 0]} color="#3a4250" count={half} radius={0.12} />
      <ChipStack position={[0.075, 0, 0]} color="#e9c46a" count={n - half} radius={0.12} />
    </group>
  );
}

// Chips swept from the pot to the winner at showdown — a short burst that flies on
// an arc from the pot to the winning seat when `nonce` changes, then fades out.
function ChipSweep({ target, nonce }: { target: [number, number, number] | null; nonce: number }) {
  const ref = useRef<THREE.Group>(null);
  const prev = useRef(nonce);
  const startRef = useRef<number | null>(null);
  useFrame((state) => {
    const now = state.clock.getElapsedTime() * 1000;
    if (nonce !== prev.current) {
      prev.current = nonce;
      startRef.current = now;
    }
    const g = ref.current;
    if (!g) return;
    if (!target || startRef.current === null) {
      g.visible = false;
      return;
    }
    const local = now - startRef.current;
    const DUR = 850;
    if (local > DUR) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const k = local / DUR;
    const e = 1 - Math.pow(1 - k, 2); // easeOut
    g.position.set(
      POT_POS[0] + (target[0] - POT_POS[0]) * e,
      POT_POS[1] + (target[1] - POT_POS[1]) * e + Math.sin(k * Math.PI) * 0.45,
      POT_POS[2] + (target[2] - POT_POS[2]) * e,
    );
    g.scale.setScalar(1 - 0.35 * k);
  });
  return (
    <group ref={ref} visible={false}>
      <ChipStack position={[-0.1, 0, 0]} color="#e9c46a" count={5} radius={0.14} />
      <ChipStack position={[0.12, 0, 0.04]} color="#c9302c" count={4} radius={0.14} />
    </group>
  );
}

// A player's committed bet, shown as a small physical chip stack on the felt
// between their seat and the pot (mirrors the reference table). Height scales
// with the wager; all-in bets glow red, others gold.
function SeatBetChips({ seat, total }: { seat: SceneSeat; total: number }) {
  if (!seat.betMinor || seat.betMinor <= 0) return null;
  const p = seatPoint(seat.index, total);
  // 44% of the way from the seat toward table center, resting on the felt.
  const bx = p[0] * 0.56;
  const bz = p[2] * 0.56;
  const count = Math.max(1, Math.min(6, Math.round(seat.betMinor / 5000)));
  const color = seat.state === "allin" ? "#ff3b46" : "#e9c46a";
  return <ChipStack position={[bx, 0.05, bz]} color={color} count={count} radius={0.13} />;
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
        <div className="flex items-center justify-center gap-1 leading-tight">
          <span className="text-[11px] font-semibold text-white">{seat.name}</span>
          {seat.isBot && (
            <span className="rounded-sm bg-white/15 px-1 text-[8px] font-bold uppercase tracking-wider text-white/80">
              Bot
            </span>
          )}
        </div>
        <div className="text-[11px] font-bold leading-tight" style={{ color: "#f3c14b" }}>{seat.stack}</div>
      </div>
      {seat.betLabel && (
        <div className="rounded-full border border-gold/40 bg-black/70 px-2 py-0.5 text-[10px] font-bold text-gold shadow-[0_0_10px_rgba(212,175,55,0.35)]">
          {seat.betLabel}
        </div>
      )}
      {seat.action && <ActionChip action={seat.action} />}
      {seat.isButton && (
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full border border-black/40 text-[10px] font-black text-[#231b00]"
          style={{ background: "linear-gradient(180deg,#ffffff,#d8d8d8)" }}
          title="Dealer button"
        >
          D
        </div>
      )}
    </div>
  );
}

function ActionChip({ action }: { action: NonNullable<SceneSeat["action"]> }) {
  const tone = {
    fold: { bg: "rgba(60,20,24,0.9)", bd: "#c9302c", fg: "#ff9aa0" },
    call: { bg: "rgba(8,40,22,0.9)", bd: "#22c55e", fg: "#8ef0b0" },
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
  const glow = seat.state === "active" ? "rgba(243,193,75,0.75)" : seat.state === "allin" ? "rgba(255,59,70,0.7)" : "rgba(91,100,114,0.5)";
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

function Scene({ seats, board, mode, maxSeats, showPot, handLive, dealNonce, potMinor, winnerSeat, winNonce }: {
  seats: SceneSeat[];
  board: string[];
  mode: AvatarMode;
  maxSeats: number;
  showPot: boolean;
  handLive: boolean;
  dealNonce: number;
  potMinor: number;
  winnerSeat: number;
  winNonce: number;
}) {
  const winTarget = useMemo<[number, number, number] | null>(() => {
    if (winnerSeat < 0) return null;
    const p = seatPoint(winnerSeat, maxSeats);
    return [p[0] * 0.9, 0.06, p[2] * 0.9];
  }, [winnerSeat, maxSeats]);
  return (
    <>
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 12, 26]} />

      <ambientLight intensity={0.35} color="#6a86b8" />
      <hemisphereLight intensity={0.45} color="#2a4d78" groundColor="#08170f" />
      <spotLight position={[0, 9.5, 2.5]} angle={0.62} penumbra={0.9} intensity={2.6} color="#fff4d8" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-7.5, 3.2, -3]} intensity={2.2} decay={0} color="#ff2d3f" />
      <pointLight position={[7.5, 3.2, -2]} intensity={2.0} decay={0} color="#ffcf6a" />
      <pointLight position={[0, 2.4, -7.5]} intensity={1.3} decay={0} color="#c8102e" />

      <Environment resolution={128}>
        <Lightformer intensity={1.4} form="rect" position={[0, 6, 1]} scale={[9, 4, 1]} color="#ffffff" />
        <Lightformer intensity={2.2} form="rect" position={[-6, 2, -3]} scale={[3, 6, 1]} color="#ff2d3f" />
        <Lightformer intensity={2.0} form="rect" position={[6, 2, -3]} scale={[3, 6, 1]} color="#ffcf6a" />
      </Environment>

      <TableBody />
      <Board board={board} />
      {showPot && <Pot potMinor={potMinor} />}
      <ChipSweep target={winTarget} nonce={winNonce} />
      {handLive && <Deck nonce={dealNonce} />}

      {/* Each seated player's own chip pile beside their seat, sized to their stack. */}
      {seats.map((s) => (
        <SeatStackChips key={`stack-${s.index}`} seat={s} total={maxSeats} />
      ))}

      {/* Face-down hole cards in front of every in-hand (non-folded) seat while a
          hand is live — deals in from the deck, so opponents visibly have cards. */}
      {handLive &&
        seats
          .filter((s) => s.state !== "folded")
          .map((s) => <SeatHoleCards key={`hole-${s.index}`} seat={s} total={maxSeats} />)}

      {/* Dealer button is rendered per-seat (SeatPill) from snapshot.button_seat. */}

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

      {/* Per-seat committed bets as physical chips on the felt (real geometry). */}
      {seats.map((s) => (
        <SeatBetChips key={`bet-${s.index}`} seat={s} total={maxSeats} />
      ))}

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
    <div className="relative flex h-[86px] w-[62px] flex-col justify-between rounded-lg bg-white p-1.5 shadow-lg" style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 18px rgba(224,30,43,0.25)" }}>
      <span className="text-lg font-bold leading-none" style={{ color }}>{rank}{glyph}</span>
      <span className="self-end text-2xl leading-none" style={{ color }}>{glyph}</span>
    </div>
  );
}

function SceneHud({ potLabel, heroHole, announce }: { potLabel: string; heroHole: [string, string] | null; announce?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {announce && (
        <div className="absolute left-1/2 top-[20%] -translate-x-1/2 text-center">
          <div
            className="rounded-full border border-gold/50 px-6 py-2 font-display text-base font-bold uppercase tracking-[0.2em] text-gold"
            style={{
              background: "rgba(8,10,14,0.82)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 0 26px rgba(233,196,106,0.4), inset 0 0 12px rgba(0,0,0,0.4)",
              animation: "seatWinPulse 1.6s ease-in-out infinite",
            }}
          >
            {announce}
          </div>
        </div>
      )}
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
  handLive = false,
  dealNonce = 0,
  potMinor = 0,
  winnerSeat = -1,
  winNonce = 0,
  announce,
  children,
  overlay,
}: CinematicSceneProps) {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% 0%, rgba(255,45,63,0.10), transparent 60%)," +
          "radial-gradient(1000px 600px at 85% 20%, rgba(200,16,46,0.10), transparent 60%)," +
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
          <Scene seats={seats} board={board} mode={mode} maxSeats={maxSeats} showPot={showPot} handLive={handLive} dealNonce={dealNonce} potMinor={potMinor} winnerSeat={winnerSeat} winNonce={winNonce} />
        </Suspense>
      </Canvas>
      {children ?? <SceneHud potLabel={potLabel} heroHole={heroHole} announce={announce} />}
      {overlay}
    </div>
  );
}

useGLTF.preload(GLB_URL);

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
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Html, useGLTF, useAnimations, Clone, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

import { cardBackTexture, cardFaceTexture, feltTexture } from "@/app/proof/textures";
import { avatarSrc } from "@/features/table/avatars";
import type { BakedConfig } from "@/features/table/bakedTable";

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
  /** At showdown, the seat's REVEALED hole cards (four-color codes) — flips the
   *  face-down backs up to show the real hand. Absent = stay face-down. */
  revealHole?: [string, string];
}

// On-felt player controls (sit-out toggle at the hero seat + "sit here" markers on
// empty seats to change seats). Provided by the live table; omitted by the /proof
// demo. serverIndex is the real seat index for moveSeat(); sceneIndex is the rotated
// index used to place the marker via seatPoint (hero is rotated to scene index 0).
export interface FeltControls {
  heroSittingOut: boolean;
  canMove: boolean;
  emptySeats: { serverIndex: number; sceneIndex: number }[];
  onSitOut: (on: boolean) => void;
  onMove: (serverIndex: number) => void;
}

export interface CinematicSceneProps {
  seats: SceneSeat[];
  /** On-felt sit-out / change-seat controls (live table only). */
  feltControls?: FeltControls;
  /** Community board as four-color card codes, e.g. ["As","Kd","7c"]. */
  board: string[];
  /** Pre-formatted pot label for the intrinsic center HUD. */
  potLabel: string;
  /** Hero hole cards for the intrinsic bottom HUD (null hides them). */
  heroHole: [string, string] | null;
  mode: AvatarMode;
  /**
   * Baked photoreal backdrop (Item 2c). When set, the scene composites over a
   * pre-rendered empty table plate: the plate is a CSS background behind the
   * transparent Canvas, the cinematic felt/rail/fog/environment are replaced by a
   * shadow-catcher + minimal art-matched key light, and the Canvas uses the plate's
   * own camera + seat ellipse so avatars land on the painted chairs. Omitted =>
   * the default cinematic R3F felt (legacy/default tables). Both render_style modes
   * (2.5D portraits / 3D GLB) render over the same plate.
   */
  backdrop?: BakedConfig;
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
// Active seat ellipse for the current scene. The cinematic felt uses the default
// (SX/SZ); a baked plate overrides it (set synchronously at the top of Scene, before
// any seatPoint() call) so seats project onto the painted chairs. There is exactly
// one live table Canvas mounted at a time, so a module-level value is safe here.
let ACTIVE_ELLIPSE = { sx: SX, sz: SZ, y: 0.12 };
function seatPoint(index: number, total: number): [number, number, number] {
  const a = (index / total) * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(a) * ACTIVE_ELLIPSE.sx, ACTIVE_ELLIPSE.y, Math.sin(a) * ACTIVE_ELLIPSE.sz];
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
    // easeOutBack — a snappy settle that slightly overshoots then lands (matches
    // the reference's back.out feel), applied to position; scale stays smooth.
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    const es = 1 - Math.pow(1 - k, 3); // easeOutCubic for scale/flip
    g.position.set(
      DECK_POS[0] + (target[0] - DECK_POS[0]) * e,
      DECK_POS[1] + (target[1] - DECK_POS[1]) * es + Math.sin(k * Math.PI) * 0.25, // slight arc
      DECK_POS[2] + (target[2] - DECK_POS[2]) * e,
    );
    if (flip) g.rotation.x = -Math.PI / 2 * (1 - es);
    g.scale.setScalar(0.86 + 0.14 * es);
  });
  return ref;
}

// One shared GGPoker card-back texture (dark-red + gold border + diamond lattice)
// for every face-down card and the deck top — a real rendered card back, not a
// flat color. Cached so we don't rebuild the canvas per card.
let _backTex: THREE.Texture | null = null;
function backTexture(): THREE.Texture {
  return (_backTex ??= cardBackTexture());
}

// Face-down card — the real rendered card-back texture on the top face (the hero's
// own cards are the DOM overlay; opponents/deck show this back).
function CardBack({ w = 0.44, h = 0.62 }: { w?: number; h?: number }) {
  const mats = useMemo(() => {
    const back = backTexture();
    const edge = new THREE.MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ map: back, roughness: 0.46 });
    return [edge, edge, top, edge, edge, edge];
  }, []);
  return (
    <mesh castShadow material={mats}>
      <boxGeometry args={[w, 0.02, h]} />
    </mesh>
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
  const cards = [];
  for (let i = 0; i < 9; i++) {
    cards.push(
      <mesh key={i} position={[0, i * 0.02, 0]} castShadow>
        <boxGeometry args={[0.44, 0.02, 0.62]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.5} />
      </mesh>,
    );
  }
  return (
    <group ref={ref} position={DECK_POS} rotation={[0, -0.3, 0]}>
      {cards}
      {/* real card-back texture on the top of the deck */}
      <group position={[0, 9 * 0.02, 0]}>
        <CardBack />
      </group>
    </group>
  );
}

// A small face-up hole card (revealed at showdown) — four-color face on top, flips
// up from face-down over ~0.5s on first mount.
function HoleFace({ code }: { code: string }) {
  const face = useMemo(() => cardFaceTexture(code), [code]);
  const mats = useMemo(() => {
    const white = new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ map: face, roughness: 0.42, emissive: new THREE.Color("#ffffff"), emissiveMap: face, emissiveIntensity: 0.16 });
    return [white, white, top, white, white, white];
  }, [face]);
  const ref = useRef<THREE.Group>(null);
  const startRef = useRef<number | null>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const now = state.clock.getElapsedTime() * 1000;
    if (startRef.current === null) startRef.current = now;
    const k = Math.min(1, (now - startRef.current) / 480);
    const e = 1 - Math.pow(1 - k, 3);
    g.rotation.x = -Math.PI * (1 - e); // flip face-down → face-up
    g.position.y = 0.05 + Math.sin(k * Math.PI) * 0.12; // small lift as it turns
  });
  return (
    <group ref={ref}>
      <mesh castShadow material={mats}>
        <boxGeometry args={[0.44, 0.02, 0.62]} />
      </mesh>
    </group>
  );
}

// Hole cards in front of a seated, in-hand player. Face-DOWN backs during the hand
// (opponents; the hero also gets backs while seeing their real cards in the DOM);
// at showdown, when the server reveals a seat's hand, the backs flip up to the real
// four-color faces.
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
  const reveal = seat.revealHole;
  if (reveal) {
    // Revealed at showdown: face-up cards at the same fanned positions.
    return (
      <>
        <group position={[bx - perpX * 0.13, 0.055, bz - perpZ * 0.13]} rotation={[0, yaw + 0.12, 0]}>
          <HoleFace code={reveal[0]} />
        </group>
        <group position={[bx + perpX * 0.13, 0.055, bz + perpZ * 0.13]} rotation={[0, yaw - 0.12, 0]}>
          <HoleFace code={reveal[1]} />
        </group>
      </>
    );
  }
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

// A chip continuously arcing from a betting seat toward the pot — the "chips pushed
// in" motion from the reference. Loops while the seat has a live bet; hidden
// otherwise. Hooks run unconditionally (visibility is toggled inside the frame).
function BetFlight({ seat, total }: { seat: SceneSeat; total: number }) {
  const p = seatPoint(seat.index, total);
  const sx = p[0] * 0.56;
  const sz = p[2] * 0.56;
  const ref = useRef<THREE.Group>(null);
  const has = !!seat.betMinor && seat.betMinor > 0;
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (!has) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const k = (state.clock.getElapsedTime() % 1.25) / 1.25; // 0..1 loop
    g.position.set(sx + (POT_POS[0] - sx) * k, 0.06 + Math.sin(k * Math.PI) * 0.34, sz + (POT_POS[2] - sz) * k);
    g.scale.setScalar(1 - 0.4 * k);
  });
  return (
    <group ref={ref} visible={false}>
      <ChipStack position={[0, 0, 0]} color="#4a9eb0" count={2} radius={0.11} />
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
  // Bring the portrait to life: gentle idle float, an eager bob on the player's
  // turn, a win pulse for the winner (shared globals.css keyframes). Folded seats
  // hold still. Staggered so seats don't float in unison.
  const anim =
    seat.state === "winner"
      ? "seatWinPulse 0.9s ease-out"
      : seat.state === "active"
        ? "seatTurnBob 1.6s ease-in-out infinite"
        : seat.state === "folded"
          ? "none"
          : "seatIdleFloat 4s ease-in-out infinite";
  // Portrait diameter (px). Enlarged so the character reads as the hero of the
  // seat (the 2.5D avatar is the headline art, not a thumbnail).
  const SIZE = 148;
  return (
    <Html position={[p[0], 0.42, p[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="flex flex-col items-center">
        <div style={{ position: "relative", opacity: seat.state === "folded" ? 0.55 : 1, animation: anim, animationDelay: `${(seat.index % 6) * 0.35}s` }}>
          <div
            style={{
              width: SIZE, height: SIZE, borderRadius: "50%", overflow: "hidden",
              border: `3px solid ${ringColor}`,
              boxShadow: `0 0 38px ${glow}, 0 0 0 2px rgba(212,175,55,0.35), inset 0 0 14px rgba(0,0,0,0.55)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" width={SIZE} height={SIZE} style={{ objectFit: "cover", display: "block", imageRendering: "auto" }} />
          </div>
          {/* owned badge */}
          <div
            style={{
              position: "absolute", right: 2, bottom: 22, width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
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
  const figureRef = useRef<THREE.Group>(null);
  const seed = seat.index * 1.7;
  // Real skeletal animation: models rigged + retargeted by Tripo (animate_rig →
  // animate_retarget, preset idle) ship an animation clip — play it. Models with no
  // clip (older/base meshes) fall back to the procedural bob below.
  const { actions, names } = useAnimations(gltf.animations, figureRef);
  const hasClip = names.length > 0;
  useEffect(() => {
    if (!hasClip) return;
    const a = actions[names[0]];
    a?.reset().fadeIn(0.3).play();
    return () => {
      a?.fadeOut(0.2);
    };
  }, [actions, names, hasClip]);
  // Procedural "life" fallback for clip-less meshes: a gentle breathing bob + sway,
  // intensifying on the player's turn and popping on a win, frozen when folded.
  useFrame((state) => {
    const g = figureRef.current;
    if (!g || hasClip) return; // a real clip owns the transform when present
    const t = state.clock.getElapsedTime();
    const active = seat.state === "active";
    const winner = seat.state === "winner";
    if (seat.state === "folded") {
      g.position.y = 0.24;
      g.rotation.z = 0;
      return;
    }
    const amp = winner ? 0.11 : active ? 0.06 : 0.028;
    const spd = winner ? 6 : active ? 3.2 : 1.5;
    g.position.y = 0.24 + Math.sin(t * spd + seed) * amp;
    g.rotation.z = Math.sin(t * spd * 0.5 + seed) * (active || winner ? 0.045 : 0.016);
  });
  return (
    <group>
      <group position={[fx, 0.0, fz]} rotation={[0, yaw, 0]}>
        <SeatChair ring={seat.ringColor} />
        {/* seated figure: larger scale, hips at the seat pad so the lap sits at
            felt height and the head clears the rail — a fuller HRC-style body. */}
        <group ref={figureRef} position={[0, 0.24, 0.06]} scale={1.28}>
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

function Scene({ seats, board, mode, maxSeats, showPot, handLive, dealNonce, potMinor, winnerSeat, winNonce, feltControls, backdrop }: {
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
  feltControls?: FeltControls;
  backdrop?: BakedConfig;
}) {
  // Set the active seat ellipse BEFORE any seatPoint() call this render. A baked
  // plate supplies its own ellipse so seats land on the painted chairs; the
  // cinematic felt keeps the contract default (SX/SZ).
  ACTIVE_ELLIPSE = backdrop
    ? { sx: backdrop.ellipse.sx, sz: backdrop.ellipse.sz, y: backdrop.ellipse.y }
    : { sx: SX, sz: SZ, y: 0.12 };

  const baked = !!backdrop;
  const winTarget = useMemo<[number, number, number] | null>(() => {
    if (winnerSeat < 0) return null;
    const p = seatPoint(winnerSeat, maxSeats);
    return [p[0] * 0.9, 0.06, p[2] * 0.9];
  }, [winnerSeat, maxSeats]);
  return (
    <>
      {baked ? (
        // Baked photoreal branch: the plate (CSS background, behind the transparent
        // Canvas) provides the felt/rail/room/lighting look. We add only a minimal
        // art-matched key light + a shadow-catcher so GLB figures drop a real shadow
        // onto the flat art. No fog / color background / Environment (those would
        // veil the plate). The cinematic contract camera/rig is untouched — this is a
        // separate opt-in path (CLAUDE.md non-negotiable #1: real geometry + shadow,
        // not a div faking 3D).
        <>
          <ambientLight intensity={0.55} color="#c9d3e0" />
          <spotLight position={[0, 9.5, 2.5]} angle={0.7} penumbra={0.9} intensity={2.2} color="#fff4d8" castShadow shadow-mapSize={[1024, 1024]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[backdrop.shadowCatcher?.size ?? 16, backdrop.shadowCatcher?.size ?? 16]} />
            <shadowMaterial transparent opacity={backdrop.shadowCatcher?.opacity ?? 0.34} />
          </mesh>
        </>
      ) : (
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
        </>
      )}
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

      {/* Chips arcing from each betting seat toward the pot while a hand is live. */}
      {handLive &&
        seats.map((s) => <BetFlight key={`flight-${s.index}`} seat={s} total={maxSeats} />)}

      {/* On-felt sit-out toggle + change-seat markers. */}
      {feltControls && <FeltControlsLayer ctl={feltControls} total={maxSeats} />}

      {/* Baked plates already carry their own ground contact + vignette in the art;
          the shadow-catcher handles live GLB shadows, so skip ContactShadows there. */}
      {!baked && (
        <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={16} blur={2.4} far={5} resolution={512} color="#000000" />
      )}

      <EffectComposer>
        {[
          <Bloom key="bloom" intensity={baked ? 0.35 : 0.55} luminanceThreshold={baked ? 0.7 : 0.55} luminanceSmoothing={0.2} mipmapBlur />,
          ...(baked ? [] : [<Vignette key="vignette" eskil={false} offset={0.28} darkness={0.82} />]),
        ]}
      </EffectComposer>
    </>
  );
}

/* ---------------- on-felt player controls ---------------- */

// Sit-out toggle anchored beside the hero seat + "Sit here" markers on empty seats
// (between hands) to change seats. Rendered as drei <Html> so the buttons live in
// the DOM (crisp text) but are anchored to real felt positions.
function FeltControlsLayer({ ctl, total }: { ctl: FeltControls; total: number }) {
  const hero = seatPoint(0, total); // hero is rotated to scene index 0 (bottom-center)
  return (
    <>
      <Html
        position={[hero[0] - 1.35, 0.6, hero[2]]}
        center
        zIndexRange={[30, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <button
          onClick={() => ctl.onSitOut(!ctl.heroSittingOut)}
          className="whitespace-nowrap rounded-full border border-gold/50 bg-black/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold backdrop-blur-md hover:bg-gold/15"
        >
          {ctl.heroSittingOut ? "I'm Back" : "Sit Out"}
        </button>
      </Html>
      {ctl.canMove &&
        ctl.emptySeats.map((e) => {
          const p = seatPoint(e.sceneIndex, total);
          return (
            <Html
              key={e.serverIndex}
              position={[p[0], 0.3, p[2]]}
              center
              zIndexRange={[30, 0]}
              style={{ pointerEvents: "auto" }}
            >
              <button
                onClick={() => ctl.onMove(e.serverIndex)}
                className="whitespace-nowrap rounded-full border border-white/25 bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md hover:border-gold/50 hover:text-gold"
              >
                Sit here
              </button>
            </Html>
          );
        })}
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
  feltControls,
  backdrop,
  children,
  overlay,
}: CinematicSceneProps) {
  // Baked plate: show the empty table image behind the transparent Canvas (cover,
  // centered) and give the Canvas the plate's art-matched camera. Cinematic (default):
  // the red/gold radial room gradient + the contract camera [0,6.9,7.9] fov 42.
  const wrapperBg = backdrop
    ? `#05070c url(${backdrop.imageUrl}) center / cover no-repeat`
    : "radial-gradient(1200px 700px at 20% 0%, rgba(255,45,63,0.10), transparent 60%)," +
      "radial-gradient(1000px 600px at 85% 20%, rgba(200,16,46,0.10), transparent 60%)," +
      "radial-gradient(900px 500px at 50% 100%, rgba(233,196,106,0.08), transparent 60%)," +
      "linear-gradient(180deg,#04060a,#070b12 60%,#04060a)";
  const cameraCfg = backdrop
    ? { position: backdrop.camera.position, fov: backdrop.camera.fov }
    : { position: [0, 6.9, 7.9] as [number, number, number], fov: 42 };
  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: wrapperBg }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={cameraCfg}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <Suspense fallback={null}>
          <Scene seats={seats} board={board} mode={mode} maxSeats={maxSeats} showPot={showPot} handLive={handLive} dealNonce={dealNonce} potMinor={potMinor} winnerSeat={winnerSeat} winNonce={winNonce} feltControls={feltControls} backdrop={backdrop} />
        </Suspense>
      </Canvas>
      {children ?? <SceneHud potLabel={potLabel} heroHole={heroHole} announce={announce} />}
      {overlay}
    </div>
  );
}

useGLTF.preload(GLB_URL);

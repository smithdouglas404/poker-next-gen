// Baked table PLATES (Item 2c). A "plate" is a pre-rendered EMPTY photoreal table
// image (no players/cards/chips/UI). The live scene composites over it: the plate is
// a CSS background behind the transparent R3F <Canvas>, a shadow-catcher plane takes
// the GLB shadows, and every seat element anchors to the SAME seatPoint() ellipse so
// both 2.5D portraits and 3D GLB figures land on the painted chairs.
//
// ONE hero-angle plate serves BOTH render styles (user-confirmed): render_style
// ("2.5d" | "3d") only chooses which avatar renders at each seat — not a separate
// plate. The plate/theme is an independent axis (`table_art`).
//
// Theme = futuristic in OUR red/gold (CLAUDE.md brand), NOT cyan cyberpunk.
//
// `camera` + `ellipse` are matched to the art's projection so the seat ring lands on
// the chairs; eyeballed from the plate and nudged on deploy. The placeholder ships
// with the cinematic defaults ([0,6.9,7.9] fov 42, SX 4.95 / SZ 3.2) so it renders
// immediately; real plates override these.

export interface BakedConfig {
  /** Empty plate image under /public (CSS background behind the transparent Canvas). */
  imageUrl: string;
  /** Art-matched camera (its OWN value — the cinematic contract camera is untouched). */
  camera: { position: [number, number, number]; fov: number };
  /** Seat ellipse so seatPoint() projects onto the painted chairs. */
  ellipse: { sx: number; sz: number; y: number };
  /** Ground shadow-catcher size + darkness (GLB castShadow drops onto the flat art). */
  shadowCatcher?: { size: number; opacity: number };
}

export interface BakedPlate extends BakedConfig {
  id: string;
  /** Owner-facing name in the "Choose a table" picker. */
  label: string;
}

// The default cinematic seat ellipse + camera (mirrors CinematicScene SX/SZ + the
// contract camera) — the placeholder reuses these so it composites without tuning.
const DEFAULT_CAMERA = { position: [0, 6.9, 7.9] as [number, number, number], fov: 42 };
const DEFAULT_ELLIPSE = { sx: 4.95, sz: 3.2, y: 0.12 };

export const BAKED_PLATES: Record<string, BakedPlate> = {
  // On-brand red/gold arena (the user's generated plate). SWAP imageUrl to
  // "/table/arena-red.jpg" once the file is committed under public/table/, then
  // nudge camera/ellipse so the 9 seats land on the painted chairs.
  "arena-red": {
    id: "arena-red",
    label: "Provably-Fair Arena — Red/Gold",
    imageUrl: "/table/placeholder-arena.svg", // TODO: /table/arena-red.jpg
    camera: DEFAULT_CAMERA,
    ellipse: DEFAULT_ELLIPSE,
    shadowCatcher: { size: 16, opacity: 0.34 },
  },
  // Cyan variant (verification-accent teal). Same table, cyan rim.
  "arena-cyan": {
    id: "arena-cyan",
    label: "Provably-Fair Arena — Cyan",
    imageUrl: "/table/placeholder-arena.svg", // TODO: /table/arena-cyan.jpg
    camera: DEFAULT_CAMERA,
    ellipse: DEFAULT_ELLIPSE,
    shadowCatcher: { size: 16, opacity: 0.34 },
  },
};

/** Ordered list for the owner "Choose a table" picker. */
export const BAKED_PLATE_LIST: BakedPlate[] = Object.values(BAKED_PLATES);

/** Resolve a table's chosen plate id → its baked config (undefined => cinematic felt). */
export function bakedPlate(id?: string | null): BakedPlate | undefined {
  if (!id) return undefined;
  return BAKED_PLATES[id];
}

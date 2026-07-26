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
  /** Number of seat frames PAINTED on the plate. The seat ring divides by this so
   *  seatPoint() lands one seat per painted chair (a live table's max_seats should
   *  match). Omitted => caller's seat count. */
  seats?: number;
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
  // Red/gold arena (the user's committed plate, 1024×1024, 10 painted seat frames).
  // camera/ellipse are tuned so seatPoint() lands the 10 seats on the painted chairs.
  "arena-red": {
    id: "arena-red",
    label: "Provably-Fair Arena — Red/Gold",
    imageUrl: "/table/2d-arenared.jpg",
    camera: { position: [0, 6.6, 8.1], fov: 40 },
    ellipse: { sx: 5.15, sz: 3.75, y: 0.12 },
    shadowCatcher: { size: 16, opacity: 0.34 },
    seats: 10,
  },
  // Cyan variant (verification-accent teal). Same table geometry, cyan rim.
  "arena-cyan": {
    id: "arena-cyan",
    label: "Provably-Fair Arena — Cyan",
    imageUrl: "/table/arena-2d.jpg",
    camera: { position: [0, 6.6, 8.1], fov: 40 },
    ellipse: { sx: 5.15, sz: 3.75, y: 0.12 },
    shadowCatcher: { size: 16, opacity: 0.34 },
    seats: 10,
  },
  // Cyan arena RE-FRAMED to 16:9 (`scripts/make-wide-plate.mjs`): the 1024-square art was being
  // `cover`-fitted into a 16:9 viewport, which blew it up ~1.9x and pushed the painted
  // seat frames off-screen. The wide plate crops to the table band and pads the sides,
  // so the whole table + all 10 painted frames sit inside the frame at 66% width.
  // Re-framing shrank the art by 1.317/1.875 = 0.702 about the screen centre, so the
  // camera is pushed back by 1/0.702 = 1.424x to shrink the projection identically —
  // the ellipse is unchanged because the seat ring must scale with the art, not drift.
  "arena-cyan-wide": {
    id: "arena-cyan-wide",
    label: "Provably-Fair Arena — Cyan (wide)",
    imageUrl: "/table/arena-cyan-16x9.jpg",
    camera: { position: [0, 9.4, 11.53], fov: 40 },
    ellipse: { sx: 5.15, sz: 3.75, y: 0.12 },
    shadowCatcher: { size: 16, opacity: 0.34 },
    seats: 10,
  },
};

/** Ordered list for the owner "Choose a table" picker. */
export const BAKED_PLATE_LIST: BakedPlate[] = Object.values(BAKED_PLATES);

/** Resolve a table's chosen plate id → its baked config (undefined => cinematic felt). */
export function bakedPlate(id?: string | null): BakedPlate | undefined {
  if (!id) return undefined;
  return BAKED_PLATES[id];
}

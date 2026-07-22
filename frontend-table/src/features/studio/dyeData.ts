// Dye Shop palettes + dye packs.
//
// Swatches are the per-channel colors a player paints onto the equipped model;
// the chosen triple is sent verbatim to `cosmetic_dye_set` as {primary,
// secondary, accent}. Dye packs are curated triples with a rarity tier — one
// click loads all three channels at once (the "one-tap look").

export interface Swatch {
  id: string;
  label: string;
  /** null = "no dye" / clear channel (rendered as an empty bordered tile). */
  hex: string | null;
  /** Optional two-stop gradient for metallic / iridescent swatches. */
  gradient?: string;
  /** Diagonal hatch fill (carbon-fiber style) when true. */
  hatch?: boolean;
}

const NONE: Swatch = { id: "none", label: "None", hex: null };

export const PRIMARY_SWATCHES: Swatch[] = [
  NONE,
  { id: "p-gold", label: "Vault Gold", hex: "#f5c518", gradient: "linear-gradient(135deg,#ffd54a,#c99700)" },
  { id: "p-rose", label: "Rose Gold", hex: "#e8b4a0" },
  { id: "p-brass", label: "Brass", hex: "#c8a850", gradient: "linear-gradient(135deg,#e6cf82,#a8860f)" },
  { id: "p-jade", label: "Jade", hex: "#22c55e" },
  { id: "p-violet", label: "Violet", hex: "#7c5cff" },
  { id: "p-mauve", label: "Mauve", hex: "#9b6a8a" },
  { id: "p-copper", label: "Copper", hex: "#c06a2c", gradient: "linear-gradient(135deg,#e08a4a,#8a4713)" },
  { id: "p-silver", label: "Silver", hex: "#c9ced6", gradient: "linear-gradient(135deg,#eef1f5,#9aa0a6)" },
];

export const SECONDARY_SWATCHES: Swatch[] = [
  NONE,
  { id: "s-silver", label: "Silver", hex: "#c9ced6", gradient: "linear-gradient(135deg,#eef1f5,#9aa0a6)" },
  { id: "s-red", label: "All-In Red", hex: "#e01e2b" },
  { id: "s-lime", label: "Lime", hex: "#a3e635" },
  { id: "s-green", label: "Felt Green", hex: "#22c55e" },
  { id: "s-teal", label: "Teal", hex: "#14b8a6" },
  { id: "s-magenta", label: "Magenta", hex: "#d946ef" },
  { id: "s-purple", label: "Purple", hex: "#7c5cff" },
  { id: "s-cyan", label: "Cyan", hex: "#22d3ee" },
];

export const ACCENT_SWATCHES: Swatch[] = [
  NONE,
  { id: "a-silver", label: "Silver", hex: "#c9ced6" },
  { id: "a-red", label: "Red", hex: "#e01e2b" },
  { id: "a-lime", label: "Lime", hex: "#a3e635" },
  { id: "a-green", label: "Green", hex: "#22c55e" },
  { id: "a-cyan", label: "Cyan", hex: "#22d3ee" },
  { id: "a-magenta", label: "Magenta", hex: "#d946ef" },
  { id: "a-purple", label: "Purple", hex: "#7c5cff" },
  { id: "a-carbon", label: "Carbon", hex: "#3a4250", hatch: true },
];

export type DyeRarity = "common" | "rare" | "epic" | "legendary";

export interface DyePack {
  id: string;
  name: string;
  rarity: DyeRarity;
  description: string;
  /** Preview swatch (gradient string). */
  swatch: string;
  /** Channel triple this pack loads. */
  primary: string;
  secondary: string;
  accent: string;
}

export const DYE_PACKS: DyePack[] = [
  {
    id: "gold-leaf",
    name: "Gold Leaf",
    rarity: "legendary",
    description: "Champagne-rinsed gold leaf with a warm brass underlay.",
    swatch: "linear-gradient(135deg,#ffe38a,#c99700 55%,#8a6410)",
    primary: "#f5c518",
    secondary: "#c8a850",
    accent: "#e08a4a",
  },
  {
    id: "midnight-chrome",
    name: "Midnight Chrome",
    rarity: "epic",
    description: "Cold gunmetal chrome cut with a midnight-blue sheen.",
    swatch: "linear-gradient(135deg,#3a4250,#12161c 55%,#5a6270)",
    primary: "#8a94a6",
    secondary: "#1f2937",
    accent: "#22d3ee",
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    rarity: "rare",
    description: "Hot magenta-to-cyan pulse over a loyalty-neon base.",
    swatch: "linear-gradient(135deg,#d946ef,#7c5cff 55%,#22d3ee)",
    primary: "#7c5cff",
    secondary: "#d946ef",
    accent: "#22d3ee",
  },
  {
    id: "carbon-fiber",
    name: "Carbon Fiber",
    rarity: "common",
    description: "Void-black woven carbon fiber with a matte grain.",
    swatch: "repeating-linear-gradient(45deg,#2a2f38,#2a2f38 4px,#1a1e24 4px,#1a1e24 8px)",
    primary: "#3a4250",
    secondary: "#1a1e24",
    accent: "#c9ced6",
  },
];

/** Fill style for a swatch tile — gradient, hatch, or flat hex. */
export function swatchFill(s: Swatch): string {
  if (s.hatch) {
    return "repeating-linear-gradient(45deg,#2a2f38,#2a2f38 3px,#1a1e24 3px,#1a1e24 6px)";
  }
  if (s.gradient) return s.gradient;
  return s.hex ?? "transparent";
}

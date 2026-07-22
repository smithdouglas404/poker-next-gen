// Compose presets for the Avatar Creator. Selecting presets builds the Tripo
// text prompt sent to `character_generate`. These are pure client-side helpers —
// the authoritative mint always happens server-side.

export interface Preset {
  id: string;
  label: string;
  /** Fragment appended to the composed prompt. */
  phrase: string;
}

export interface PresetGroup {
  key: "archetype" | "outfit" | "style" | "accessory";
  label: string;
  presets: Preset[];
}

export const PRESET_GROUPS: PresetGroup[] = [
  {
    key: "archetype",
    label: "Archetype",
    presets: [
      { id: "poker-boss", label: "Poker Boss", phrase: "a high-roller poker boss" },
      { id: "cyber-samurai", label: "Cyber Samurai", phrase: "a neon cyber samurai" },
      { id: "void-witch", label: "Void Witch", phrase: "a mysterious void witch" },
      { id: "gold-phantom", label: "Gold Phantom", phrase: "a golden phantom gambler" },
      { id: "street-racer", label: "Street Racer", phrase: "a chrome street racer" },
      { id: "oracle-seer", label: "Oracle Seer", phrase: "a glowing oracle seer" },
    ],
  },
  {
    key: "outfit",
    label: "Outfit",
    presets: [
      { id: "gold-suit", label: "Gold Suit", phrase: "wearing a tailored gold suit" },
      { id: "neon-jacket", label: "Neon Jacket", phrase: "in a neon-lit leather jacket" },
      { id: "tux", label: "Black Tux", phrase: "in a sharp black tuxedo" },
      { id: "cyber-armor", label: "Cyber Armor", phrase: "clad in sleek cyber armor" },
      { id: "silk-robe", label: "Silk Robe", phrase: "draped in an ornate silk robe" },
    ],
  },
  {
    key: "style",
    label: "Style",
    presets: [
      { id: "cinematic", label: "Cinematic", phrase: "cinematic lighting, ultra detailed" },
      { id: "anime", label: "Anime", phrase: "stylized anime rendering" },
      { id: "realistic", label: "Realistic", phrase: "photorealistic PBR materials" },
      { id: "vaporwave", label: "Vaporwave", phrase: "vaporwave neon aesthetic" },
      { id: "noir", label: "Noir", phrase: "dark noir mood, dramatic shadows" },
    ],
  },
  {
    key: "accessory",
    label: "Accessory",
    presets: [
      { id: "shades", label: "Shades", phrase: "with mirrored shades" },
      { id: "cigar", label: "Cigar", phrase: "holding a lit cigar" },
      { id: "crown", label: "Crown", phrase: "wearing a jeweled crown" },
      { id: "chips", label: "Chip Stack", phrase: "surrounded by stacks of gold chips" },
      { id: "cards", label: "Aces", phrase: "fanning a pair of aces" },
    ],
  },
];

/** Dye swatches offered in the wardrobe. Value goes to `cosmetic_dye_set`. */
export const DYE_SWATCHES: { id: string; label: string; hex: string }[] = [
  { id: "cyan", label: "Neon Cyan", hex: "#81ecff" },
  { id: "gold", label: "Vault Gold", hex: "#d4af37" },
  { id: "violet", label: "Void Violet", hex: "#b44dff" },
  { id: "crimson", label: "All-In Red", hex: "#ff3b46" },
  { id: "emerald", label: "Felt Green", hex: "#1fa85a" },
  { id: "ice", label: "Ice Blue", hex: "#2f6bff" },
];

/** Default generation fee in cents (mirrors backend CHARACTER_GEN_FEE_CENTS). */
export const GEN_FEE_CENTS = 500;

export type PresetSelection = Partial<Record<PresetGroup["key"], string>>;

/**
 * Compose the final Tripo prompt from the free-text seed and chosen presets.
 * Free text always leads; preset phrases follow in group order.
 */
export function composePrompt(seed: string, selection: PresetSelection): string {
  const parts: string[] = [];
  const trimmed = seed.trim();
  if (trimmed) parts.push(trimmed);
  for (const group of PRESET_GROUPS) {
    const chosen = selection[group.key];
    if (!chosen) continue;
    const preset = group.presets.find((p) => p.id === chosen);
    if (preset) parts.push(preset.phrase);
  }
  return parts.join(", ");
}

import { RARITY } from "@/features/ui/tokens";

type RarityKey = keyof typeof RARITY;

/** Normalize an arbitrary server rarity string onto the four canonical tiers. */
export function rarityKey(raw: string | undefined): RarityKey {
  const r = (raw ?? "").toLowerCase();
  if (r === "legendary" || r === "mythic") return "legendary";
  if (r === "epic") return "epic";
  if (r === "rare") return "rare";
  return "common";
}

export function rarityStyle(raw: string | undefined) {
  return RARITY[rarityKey(raw)];
}

/** Format cents as a USD price string. */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Offline demo data for the Avatar Creator. Used ONLY when the Nakama backend
// is unreachable (guest / no-backend). Every surface that renders demo data
// flags it clearly so it is never mistaken for live inventory.

import { avatarGradient, avatarSrc } from "@/features/table/avatars";
import type { Cosmetic, EquippedMap, Loadout } from "./types";

function demoModel(id: string, name: string, rarity: string, portraitId: string): Cosmetic {
  return {
    id,
    kind: "model",
    name,
    rarity,
    // No real GLB offline — preview uses the shipped portrait art.
    asset_ref: "",
    preview_ref: avatarSrc(portraitId),
    demo: true,
  };
}

export const DEMO_INVENTORY: Cosmetic[] = [
  demoModel("cos-demo-1", "Neon Viper Boss", "legendary", "neon-viper"),
  demoModel("cos-demo-2", "Gold Phantom", "legendary", "gold-phantom"),
  demoModel("cos-demo-3", "Chrome Siren", "epic", "chrome-siren"),
  demoModel("cos-demo-4", "Void Witch", "epic", "void-witch"),
  {
    id: "cos-demo-hat",
    kind: "hat",
    name: "Vault Crown",
    rarity: "rare",
    asset_ref: "",
    preview_ref: "",
    demo: true,
  },
  {
    id: "cos-demo-card",
    kind: "cardback",
    name: "Cyan Circuit Deck",
    rarity: "rare",
    asset_ref: "",
    preview_ref: "",
    demo: true,
  },
];

export const DEMO_EQUIPPED: EquippedMap = {
  model: "cos-demo-1",
  cardback: "cos-demo-card",
};

export const DEMO_CATALOG: Cosmetic[] = [
  {
    id: "cat-demo-1",
    kind: "hat",
    name: "Neon Fedora",
    rarity: "epic",
    asset_ref: "",
    preview_ref: "",
    price_cents: 250,
    demo: true,
  },
  {
    id: "cat-demo-2",
    kind: "cardback",
    name: "Gold Leaf Deck",
    rarity: "legendary",
    asset_ref: "",
    preview_ref: "",
    price_cents: 500,
    demo: true,
  },
  {
    id: "cat-demo-3",
    kind: "table",
    name: "Obsidian Felt",
    rarity: "rare",
    asset_ref: "",
    preview_ref: "",
    price_cents: 400,
    demo: true,
  },
  {
    id: "cat-demo-4",
    kind: "emote",
    name: "Chip Toss",
    rarity: "common",
    asset_ref: "",
    preview_ref: "",
    price_cents: 100,
    demo: true,
  },
];

export const DEMO_LOADOUTS: Loadout[] = [
  {
    id: "lo-demo-1",
    name: "High Roller",
    slots_json: JSON.stringify({ model: "cos-demo-1", cardback: "cos-demo-card" }),
    created_at: new Date().toISOString(),
    demo: true,
  },
  {
    id: "lo-demo-2",
    name: "Midnight Noir",
    slots_json: JSON.stringify({ model: "cos-demo-4", hat: "cos-demo-hat" }),
    created_at: new Date().toISOString(),
    demo: true,
  },
];

/** A stable gradient for a demo/preview-less cosmetic tile. */
export function tileGradient(key: string): string {
  return avatarGradient(key);
}

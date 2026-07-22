// Cart construction + store-currency pricing for checkout.
//
// The cart is populated from the live cosmetics catalog when the backend is
// reachable (so each line carries a real cosmetic id that cosmetic_buy can
// settle) and falls back to a static demo cart offline — per the brief
// ("Wire to real buy RPC; demo cart offline").

import { rarityKey } from "@/features/marketplace/rarity";
import type { Cosmetic } from "@/features/marketplace/types";
import type { CartItem } from "./types";

/** Displayed gold price per rarity tier (matches the HRC 20k/50k/…/170k feel). */
const GOLD_BY_RARITY: Record<ReturnType<typeof rarityKey>, number> = {
  common: 20000,
  rare: 50000,
  epic: 100000,
  legendary: 170000,
};

/** Displayed ETH price per rarity tier. */
const ETH_BY_RARITY: Record<ReturnType<typeof rarityKey>, number> = {
  common: 0.25,
  rare: 0.5,
  epic: 0.75,
  legendary: 1.0,
};

export function goldFor(rarity: string | undefined): number {
  return GOLD_BY_RARITY[rarityKey(rarity)];
}

export function ethFor(rarity: string | undefined): number {
  return ETH_BY_RARITY[rarityKey(rarity)];
}

export function formatGold(gold: number): string {
  return `${gold.toLocaleString("en-US")} Gold`;
}

export function formatEth(eth: number): string {
  // Trim trailing zeros but keep at least one decimal (0.5, 1.25, 2 → 2).
  const n = Number(eth.toFixed(4));
  return `${n} ETH`;
}

export function cartTotals(items: CartItem[]): { gold: number; eth: number; count: number } {
  return items.reduce(
    (acc, i) => ({
      gold: acc.gold + i.gold * i.qty,
      eth: acc.eth + i.eth * i.qty,
      count: acc.count + i.qty,
    }),
    { gold: 0, eth: 0, count: 0 },
  );
}

/** Build a checkout cart from real catalog cosmetics not already owned. */
export function cartFromCatalog(catalog: Cosmetic[], ownedIds: Set<string>): CartItem[] {
  const buyable = catalog.filter((c) => c.active !== false && !ownedIds.has(c.id));
  // Prefer higher-rarity items first for a punchier default cart.
  const ranked = [...buyable].sort((a, b) => goldFor(b.rarity) - goldFor(a.rarity));
  const picked = ranked.slice(0, 4);
  if (picked.length === 0) return DEMO_CART;
  return picked.map((c, idx) => ({
    id: `line-${c.id}`,
    source: "shop",
    cosmeticId: c.id,
    name: c.name,
    kind: c.kind,
    rarity: c.rarity,
    preview: c.preview_ref,
    gold: goldFor(c.rarity),
    eth: ethFor(c.rarity),
    qty: idx === 1 ? 2 : 1,
  }));
}

/** Static offline cart — mirrors the HRC "Cyber-Knight" bundle in the mock. */
export const DEMO_CART: CartItem[] = [
  {
    id: "demo-ck-1",
    source: "shop",
    cosmeticId: "demo-cyber-knight-legendary",
    name: "Cyber-Knight X1",
    kind: "avatar",
    rarity: "legendary",
    gold: 50000,
    eth: 0.5,
    qty: 1,
  },
  {
    id: "demo-ck-2",
    source: "shop",
    cosmeticId: "demo-cyber-knight-epic",
    name: "Cyber-Knight X2",
    kind: "avatar",
    rarity: "epic",
    gold: 50000,
    eth: 0.5,
    qty: 1,
  },
  {
    id: "demo-ck-3",
    source: "shop",
    cosmeticId: "demo-cyber-knight-rare",
    name: "Cyber-Knight X1",
    kind: "avatar",
    rarity: "rare",
    gold: 20000,
    eth: 0.25,
    qty: 1,
  },
  {
    id: "demo-ck-4",
    source: "shop",
    cosmeticId: "demo-cyber-knight-common",
    name: "Cyber-Knight X1",
    kind: "avatar",
    rarity: "common",
    gold: 50000,
    eth: 0.5,
    qty: 1,
  },
];

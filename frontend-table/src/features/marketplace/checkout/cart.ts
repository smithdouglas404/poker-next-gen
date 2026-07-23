// Cart construction + pricing for checkout.
//
// The cart is populated from the live cosmetics catalog when the backend is
// reachable (each line carries a real cosmetic id + its real price so the
// displayed total EQUALS what the wallet is charged) and falls back to a static
// demo cart offline. Prices are the cosmetic's real USD `price_cents` — the same
// value the server debits — so there is no display-vs-charge mismatch.

import { usd } from "@/features/marketplace/rarity";
import type { Cosmetic } from "@/features/marketplace/types";
import type { CartItem } from "./types";

/** Real USD price of one line (cents → "$12.00"). */
export function formatPrice(cents: number): string {
  return usd(cents);
}

export function cartTotals(items: CartItem[]): { cents: number; count: number } {
  return items.reduce(
    (acc, i) => ({ cents: acc.cents + i.priceCents * i.qty, count: acc.count + i.qty }),
    { cents: 0, count: 0 },
  );
}

/** Build a checkout cart from real catalog cosmetics not already owned. */
export function cartFromCatalog(catalog: Cosmetic[], ownedIds: Set<string>): CartItem[] {
  const buyable = catalog.filter((c) => c.active !== false && !ownedIds.has(c.id));
  // Highest-priced items first for a punchier default cart.
  const ranked = [...buyable].sort((a, b) => b.price_cents - a.price_cents);
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
    priceCents: c.price_cents,
    qty: idx === 1 ? 2 : 1,
  }));
}

/** Static offline cart — clearly labelled demo (settles locally, never charged). */
export const DEMO_CART: CartItem[] = [
  { id: "demo-ck-1", source: "shop", cosmeticId: "demo-cyber-knight-legendary", name: "Cyber-Knight X1", kind: "avatar", rarity: "legendary", priceCents: 50_00, qty: 1 },
  { id: "demo-ck-2", source: "shop", cosmeticId: "demo-cyber-knight-epic", name: "Cyber-Knight X2", kind: "avatar", rarity: "epic", priceCents: 30_00, qty: 1 },
  { id: "demo-ck-3", source: "shop", cosmeticId: "demo-cyber-knight-rare", name: "Cyber-Knight X1", kind: "avatar", rarity: "rare", priceCents: 20_00, qty: 1 },
  { id: "demo-ck-4", source: "shop", cosmeticId: "demo-cyber-knight-common", name: "Cyber-Knight X1", kind: "avatar", rarity: "common", priceCents: 10_00, qty: 1 },
];

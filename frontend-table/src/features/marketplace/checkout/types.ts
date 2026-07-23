// Types for the marketplace checkout + purchase-success flow.
// A cart line references a REAL cosmetic (cosmetic_buy) or a REAL listing
// (marketplace_buy) so "Complete Purchase" settles through a registered RPC.
// Prices are the real USD `price_cents` the wallet is charged — no fake currency.

import type { Cosmetic, Listing } from "@/features/marketplace/types";

export interface CartItem {
  /** Stable cart-line key. */
  id: string;
  /** "shop" → cosmetic_buy · "market" → marketplace_buy. */
  source: "shop" | "market";
  /** Real cosmetic id (shop lines). */
  cosmeticId?: string;
  /** Real listing id (market lines). */
  listingId?: string;
  name: string;
  kind?: string;
  rarity: string;
  preview?: string;
  /** Real USD price for one unit, in cents — the exact amount charged. */
  priceCents: number;
  /** Quantity (shown as "X1", "X2" like the mock). */
  qty: number;
}

/** Result of one settled (or demo-settled) line. */
export interface PurchaseLineResult {
  item: CartItem;
  ok: boolean;
  error?: string;
}

/** Source shapes accepted when constructing a cart from live catalog data. */
export type CartSource = Cosmetic | Listing;

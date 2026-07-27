// Shared types for the Vault (marketplace + shop + wardrobe) screen.
// Field names mirror the backend-core store structs 1:1 so responses map cleanly.

export interface Cosmetic {
  id: string;
  kind: string;
  name: string;
  rarity: string;
  asset_ref?: string;
  preview_ref: string;
  owner_user_id?: string;
  price_cents: number;
  active?: boolean;
}

export interface Listing {
  id: string;
  seller_user_id: string;
  cosmetic_id: string;
  price_cents: number;
  status: string;
  name?: string;
  kind?: string;
  rarity?: string;
  preview_ref?: string;
}

/** One line of the caller's own trading history (marketplace_activity). */
export interface TradeActivity {
  id: string;
  cosmetic_id: string;
  name?: string;
  kind?: string;
  rarity?: string;
  preview_ref?: string;
  price_cents: number;
  fee_cents: number;
  /** What the seller actually received. Zero on a buy line. */
  net_cents: number;
  status: string; // open | sold | cancelled
  side: "sell" | "buy";
  updated_at?: string;
}

export interface Loadout {
  id: string;
  user_id: string;
  name: string;
  slots_json: string;
  created_at?: string;
}

export interface NFTStatus {
  configured: boolean;
  status: string; // "none" | "pending" | "minted" | "failed"
  mint_id?: string;
  tx_hash?: string;
  chain?: string;
  message?: string;
}

/** Equipped is a map of cosmetic kind -> owned cosmetic id. */
export type Equipped = Record<string, string>;

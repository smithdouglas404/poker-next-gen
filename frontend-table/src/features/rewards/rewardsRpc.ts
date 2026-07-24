// Typed wrappers over callSessionRpc for the Rewards / Sponsor marketplace.
// Every function maps 1:1 to an RPC registered in backend-core/main.go — points
// spend through reward_redeem, buy through points_purchase; no fabricated data.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export type RewardCategory = "travel" | "food" | "recreation" | "experiences" | "merch";

export interface RewardSponsor {
  id: string;
  name: string;
  category: string;
  description: string;
  logo_url: string;
  active: boolean;
}

export interface RewardItem {
  id: string;
  sponsor_id: string;
  sponsor_name?: string;
  category: string;
  title: string;
  description: string;
  image_url: string;
  points_cost: number;
  cash_value_cents: number;
  stock: number; // -1 = unlimited
  active: boolean;
}

export interface RewardsCatalog {
  categories: string[];
  sponsors: RewardSponsor[];
  items: RewardItem[];
}

export interface PointsBalance {
  user_id: string;
  spendable: number;
  lifetime: number;
  hands_played: number;
  hands_won: number;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  item_id: string;
  sponsor_id: string;
  title: string;
  category: string;
  points_spent: number;
  status: string; // pending | fulfilled | cancelled
  voucher_code: string;
  created_at: string;
  fulfilled_at?: string | null;
}

export const rewardsApi = {
  catalog: (category?: string) =>
    call<RewardsCatalog>("rewards_catalog", { category: category ?? "" }),
  balance: () => call<PointsBalance>("points_balance", {}),
  redeem: (itemId: string) =>
    call<{ ok: boolean; redemption: RewardRedemption; spendable: number }>("reward_redeem", {
      item_id: itemId,
    }),
  buyPoints: (points: number) =>
    call<{ ok: boolean; points: number; cost_cents: number; spendable: number }>("points_purchase", {
      points,
    }),
  redemptions: () =>
    call<{ redemptions: RewardRedemption[] }>("reward_redemptions_list", {}),
};

/** Compact integer, e.g. 128700 → "128.7k". */
export function compactPoints(n: number | undefined | null): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  travel: { label: "Travel", icon: "✈️" },
  food: { label: "Food & Dining", icon: "🍽️" },
  recreation: { label: "Recreation", icon: "🎯" },
  experiences: { label: "Experiences", icon: "🎟️" },
  merch: { label: "Merch", icon: "🧢" },
};

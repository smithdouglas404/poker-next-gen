// Typed wrappers for the staking / backing marketplace (P10). Every call hits a
// registered backend RPC (rpc/staking.go). The backend escrows the stake before
// any advance and rejects all of these while real money is enabled — staking is
// play-money only.
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type { StakingDeal, StakingListResult } from "./types";

export const stakingApi = {
  // Backer posts an open offer (stake escrowed on the server).
  offer: (p: { stake_minor: number; markup_bps: number; note: string }) =>
    callSessionRpc("staking_offer", p) as Promise<{ ok: boolean; id: string }>,

  // Player takes an open offer (escrowed stake advanced to them).
  accept: (dealId: string) =>
    callSessionRpc("staking_accept", { deal_id: dealId }) as Promise<{ ok: boolean }>,

  // Backer cancels their own unaccepted offer (refunded).
  cancel: (dealId: string) =>
    callSessionRpc("staking_cancel", { deal_id: dealId }) as Promise<{ ok: boolean }>,

  // Any player declines an unaccepted offer (backer refunded).
  decline: (dealId: string) =>
    callSessionRpc("staking_decline", { deal_id: dealId }) as Promise<{ ok: boolean }>,

  // Either party proposes the repay amount (what the player returns to the backer).
  proposeSettle: (dealId: string, repayMinor: number) =>
    callSessionRpc("staking_settle_propose", {
      deal_id: dealId,
      repay_minor: repayMinor,
    }) as Promise<{ ok: boolean }>,

  // The OTHER party confirms → the player repays the backer.
  confirmSettle: (dealId: string) =>
    callSessionRpc("staking_settle_confirm", { deal_id: dealId }) as Promise<{
      ok: boolean;
      repay_minor: number;
    }>,

  // Either party rejects a pending proposal → back to active to renegotiate.
  rejectSettle: (dealId: string) =>
    callSessionRpc("staking_settle_reject", { deal_id: dealId }) as Promise<{ ok: boolean }>,

  // The caller's deals (as backer and as player).
  list: () => callSessionRpc("staking_list", {}) as Promise<StakingListResult>,

  // Open offers awaiting a player.
  openList: () => callSessionRpc("staking_open_list", {}) as Promise<StakingListResult>,
};

export type { StakingDeal };

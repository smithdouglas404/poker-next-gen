// Staking / backing marketplace (P10) — client types mirroring the backend
// StakingDeal (store/staking.go). Amounts are minor units (cents). Play-money
// only: the backend rejects every staking RPC while real money is enabled.

export type StakingStatus =
  | "offered"
  | "active"
  | "settle_proposed"
  | "settled"
  | "cancelled"
  | "declined";

export interface StakingDeal {
  id: string;
  backer: string;
  backer_name: string;
  player: string;
  player_name: string;
  stake_minor: number;
  markup_bps: number;
  note: string;
  status: StakingStatus;
  settle_proposed_by: string;
  repay_minor: number;
  created_at: string;
  settled_at?: string | null;
}

export interface StakingListResult {
  deals: StakingDeal[];
  me: string;
}

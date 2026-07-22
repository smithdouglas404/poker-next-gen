// Shared wire types for the provably-fair verification surface. Shapes mirror the
// backend-core RPCs exactly (rpc/audit.go, rpc/anchor.go, rpc/stats.go).

export interface VerifyResult {
  match_id?: string;
  hand_no?: number;
  event_count?: number;
  chain_valid?: boolean;
  chain_errors?: string[];
  deck_valid?: boolean;
  deck_commit?: string;
  reveal_seed?: string;
  verify_method?: string;
  computed_deck?: string;
  deck_revealed?: boolean;
}

export interface AuditEvent {
  id?: string;
  event_type: string;
  hand_no: number;
  payload: Record<string, unknown>;
  payload_hash?: string;
  prev_hash?: string;
  created_at?: string;
}

export interface AuditListResult {
  events?: AuditEvent[];
  count?: number;
}

export interface AnchorBatch {
  id?: string;
  merkle_root: string;
  event_count: number;
  tx_hash: string;
  chain?: string;
  status?: string;
}

export interface AnchorStatusResult {
  configured: boolean;
  latest: AnchorBatch | null;
}

export interface AnchorRunResult {
  configured?: boolean;
  anchored?: number;
  merkle_root?: string;
  tx_hash?: string;
  message?: string;
}

export interface HandIndexRow {
  id: string;
  match_id: string;
  room_id: string;
  table_label: string;
  hand_no: number;
  user_ids: string[] | null;
  winner_seats: number[] | null;
  pot: number;
  rake: number;
  deck_commit: string;
  anchored: boolean;
  anchor_tx: string;
  net_cents: number;
  won: boolean;
  created_at: string;
}

export interface HandHistoryResult {
  hands?: HandIndexRow[];
  limit?: number;
  offset?: number;
}

/** A hand a user can point the verifier at. */
export interface HandRef {
  matchId: string;
  handNo: number;
}

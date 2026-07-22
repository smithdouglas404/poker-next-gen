// Typed wrappers around the real backend-core RPCs that power the fairness suite.
// Every control on the three screens resolves to one of these calls:
//   audit_list         → rpc.AuditList        (per-hand hash-chained event log)
//   audit_verify_hand  → rpc.AuditVerifyHand  (chain + deck-commitment check + reveal)
//   hand_history       → rpc.HandHistory      (caller's searchable hand index)
//   hand_replay        → rpc.HandReplay       (ordered street-by-street replay; optional)
//   anchor_status      → rpc.AnchorStatus     (latest on-chain anchor batch)
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  AnchorStatusResult,
  AuditListResult,
  HandHistoryResult,
  VerifyResult,
} from "@/features/provably/types";

export async function auditVerifyHand(matchId: string, handNo: number): Promise<VerifyResult> {
  return (await callSessionRpc("audit_verify_hand", {
    match_id: matchId,
    hand_no: handNo,
  })) as VerifyResult;
}

export async function auditList(matchId: string, handNo: number): Promise<AuditListResult> {
  return (await callSessionRpc("audit_list", {
    match_id: matchId,
    hand_no: handNo,
  })) as AuditListResult;
}

export async function handHistory(limit = 24, onChainOnly = false): Promise<HandHistoryResult> {
  return (await callSessionRpc("hand_history", {
    limit,
    on_chain_only: onChainOnly,
  })) as HandHistoryResult;
}

export interface HandReplayResult {
  match_id?: string;
  hand_no?: number;
  streets?: { name?: string; cards?: string[] }[];
  hole?: string[];
  board?: string[];
}

/** Ordered street-by-street replay. Not guaranteed on every deployment — callers
 *  should catch and fall back to deriving chronology from audit_list events. */
export async function handReplay(matchId: string, handNo: number): Promise<HandReplayResult> {
  return (await callSessionRpc("hand_replay", {
    match_id: matchId,
    hand_no: handNo,
  })) as HandReplayResult;
}

export async function anchorStatus(): Promise<AnchorStatusResult> {
  return (await callSessionRpc("anchor_status", {})) as AnchorStatusResult;
}

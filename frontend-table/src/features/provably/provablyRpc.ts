// Typed wrappers around the real backend-core RPCs that power the provably-fair
// surface. Every button on the screen resolves to one of these calls.
//   audit_list         → rpc.AuditList         (timeline / replay events)
//   audit_verify_hand  → rpc.AuditVerifyHand   (chain + deck commitment check)
//   anchor_status      → rpc.AnchorStatus      (latest Polygon anchor batch)
//   anchor_run         → rpc.AnchorRun         (admin: anchor pending batch)
//   hand_history       → rpc.HandHistory       (caller's searchable hand index)
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  AnchorRunResult,
  AnchorStatusResult,
  AuditListResult,
  HandHistoryResult,
  VerifyResult,
} from "./types";

export async function verifyHand(matchId: string, handNo: number): Promise<VerifyResult> {
  return (await callSessionRpc("audit_verify_hand", {
    match_id: matchId,
    hand_no: handNo,
  })) as VerifyResult;
}

export async function listAudit(matchId: string, handNo: number): Promise<AuditListResult> {
  return (await callSessionRpc("audit_list", {
    match_id: matchId,
    hand_no: handNo,
  })) as AuditListResult;
}

export async function anchorStatus(): Promise<AnchorStatusResult> {
  return (await callSessionRpc("anchor_status", {})) as AnchorStatusResult;
}

export async function anchorRun(): Promise<AnchorRunResult> {
  return (await callSessionRpc("anchor_run", {})) as AnchorRunResult;
}

export async function handHistory(limit = 40, onChainOnly = false): Promise<HandHistoryResult> {
  return (await callSessionRpc("hand_history", {
    limit,
    on_chain_only: onChainOnly,
  })) as HandHistoryResult;
}

// Typed wrappers for the solo GTO trainer. Every call hits an EXISTING solver
// RPC that proxies to the Rust engine-math sidecar. We tag `live:false` /
// `stakes:false` so the anti-RTA guard (rpc/rta.go — only blocks when BOTH are
// true) always allows practice, which is the intended "play on HRC, get coached"
// loop. No backend work — this is pure surfacing.
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

export interface GtoAdvice {
  suggested_action?: string;
  hero_equity?: number;
  pot_odds?: number;
  ev_call?: number;
  engine?: string;
  note?: string;
  rationale?: string;
}

export interface CfrAdvice {
  suggested_action?: string;
  amount?: number;
  hero_equity?: number;
  nodes_explored?: number;
  iterations?: number;
  converged?: boolean;
  engine?: string;
  solver?: string;
  note?: string;
}

export interface CoachTip {
  alert?: string;
  severity?: string;
  suggestion?: string;
  hero_equity?: number;
  pot_odds?: number;
  rationale?: string;
  engine?: string;
}

const practice = { live: false, stakes: false } as const;

export const trainerApi = {
  handRank: (cards: string) =>
    callSessionRpc("hand_rank", { cards }) as Promise<{ category?: string; engine?: string }>,

  equity: (holes: string[], board: string, iterations = 2500) =>
    callSessionRpc("equity_estimate", { holes, board, iterations }) as Promise<{
      equity?: number[];
      iterations?: number;
      engine?: string;
    }>,

  gtoAdvise: (p: {
    hero_hole: string;
    villain_holes: string[];
    board: string;
    pot: number;
    to_call: number;
    iterations?: number;
  }) =>
    callSessionRpc("gto_advise", {
      ...p,
      iterations: p.iterations ?? 2500,
      ...practice,
    }) as Promise<GtoAdvice>,

  gtoSolve: (p: {
    hero_hole: string;
    villain_hole: string;
    board: string;
    hero_stack: number;
    villain_stack: number;
    pot: number;
    to_call: number;
  }) =>
    callSessionRpc("gto_solve", {
      ...p,
      deadline_ms: 2500,
      iterations: 0,
      ...practice,
    }) as Promise<CfrAdvice>,

  coachingTip: (p: {
    hero_hole: string;
    villain_holes: string[];
    board: string;
    pot: number;
    to_call: number;
  }) => callSessionRpc("coaching_tip", { ...p, ...practice }) as Promise<CoachTip>,
};

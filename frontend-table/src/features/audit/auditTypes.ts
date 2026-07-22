// Wire + view types for the 3-part fairness suite (dashboard / seed reveal /
// hand audit). Backend shapes mirror rpc/audit.go, rpc/anchor.go, rpc/stats.go;
// the view types are what the components render (real data OR demo fallback).

export type ProofStatus = "in_progress" | "ready_to_reveal" | "verified";

/** One row of the "Recent Cryptographic Proofs" table. */
export interface ProofRow {
  handId: string;
  matchId: string;
  handNo: number;
  commit: string; // full commitment hash
  status: ProofStatus;
}

/** One row of the "Audit History Log". */
export interface AuditHistoryRow {
  tableId: string;
  matchId: string;
  handNo: number;
  timestamp: string;
  publicSeed: string;
  verified: boolean;
}

/** Live entropy-stream + randomness readout for the dashboard. */
export interface EntropyReadout {
  tableId: string;
  vrfSample: string;
  masterSeedState: string;
  mouseClicks: number;
  poolBits: number;
  randomnessScore: number;
  hardwareStatus: string;
}

/** System-health panel (from anchor_status + hand index counts). */
export interface SystemHealth {
  operational: boolean;
  rngLatencyMs: number;
  ledgerConsistency: string; // "SYNCED" | "PENDING" ...
  activeProofs: number;
  anchorConfigured: boolean;
  anchorTx: string | null;
  anchorChain: string | null;
}

/** Everything the dashboard view needs, live or demo. */
export interface DashboardData {
  demo: boolean;
  entropy: EntropyReadout;
  health: SystemHealth;
  proofs: ProofRow[];
  history: AuditHistoryRow[];
}

/** Result of a seed reveal + local reproduction. */
export interface RevealResult {
  demo: boolean;
  matchId: string;
  handNo: number;
  sessionId: string;
  serverSeedHash: string; // the locked commitment
  revealedSeed: string;
  playerSeed: string;
  combinedSeed: string;
  chainValid: boolean;
  deckValid: boolean;
  commitMatches: boolean;
  verifyMethod: string;
  deck: string[];
  resultingCards: string[]; // hero hole cards from the reproduced deck
  handLabel: string;
  handProb: string;
  node: string;
  latencyMs: number;
}

/** A single card's cryptographic proof card in the hand-audit detail. */
export interface CardProof {
  index: number; // 0-based card index
  label: string; // "Hole 1", "Flop 1-3", ...
  card: string; // e.g. "Ah"
  entropySource: string;
  sha256: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  active: boolean;
}

export interface ChronologyStreet {
  name: string; // PRE-FLOP (HOLE CARDS) / THE FLOP / THE TURN / THE RIVER
  cards: string[];
}

/** Everything the hand-audit detail view needs, live or demo. */
export interface HandAuditData {
  demo: boolean;
  sessionId: string;
  matchId: string;
  handNo: number;
  verifiedPath: boolean;
  timestamp: string;
  winningHand: string;
  potLabel: string;
  chronology: ChronologyStreet[];
  proofs: CardProof[];
  integrityChecked: boolean;
  serverSeed: string;
  clientSeed: string;
  commit: string;
  revealedSeed: string;
}

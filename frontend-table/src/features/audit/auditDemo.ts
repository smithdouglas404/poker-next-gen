// Offline / guest demo data for the fairness suite. Clearly the no-backend
// fallback — every screen renders a "DEMO" badge when this is used so demo is
// never presented as live verification.
import type {
  AuditHistoryRow,
  CardProof,
  ChronologyStreet,
  DashboardData,
  HandAuditData,
  ProofRow,
} from "./auditTypes";

// A fixed 64-hex demo seed whose SHA-256 commitment is stable, so the reveal
// screen reproduces a consistent deck offline.
export const DEMO_SEED = "4c7a6e12f8b5d3a9c7e0f2b4a6d8c0e2f4a6d8c0e2f4a6d8c0e2f4a6d8c0e2f4";
export const DEMO_MATCH_ID = "demo-0x882A";
export const DEMO_HAND_NO = 9982;
export const DEMO_SESSION_ID = "NV-8829-QX-P0";

const HANDS = ["JADE", "NEON", "VOID", "ONYX", "FLUX", "HALO", "ZERO", "VOLT"];

function hexChunk(seed: number, len: number): string {
  let s = "";
  let x = seed >>> 0;
  for (let i = 0; i < len; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    s += "0123456789abcdef"[(x >>> 8) & 0xf];
  }
  return s;
}

function longHash(seed: number): string {
  return `0x${hexChunk(seed, 8)}...${hexChunk(seed + 7, 4)}...${hexChunk(seed + 13, 4)}...${hexChunk(seed + 21, 4)}`;
}

export function demoDashboard(): DashboardData {
  const proofs: ProofRow[] = [
    { handId: "#TX-9982-A", matchId: DEMO_MATCH_ID, handNo: 9982, commit: longHash(9982), status: "in_progress" },
    { handId: "#TX-9981-C", matchId: DEMO_MATCH_ID, handNo: 9981, commit: longHash(9981), status: "ready_to_reveal" },
    { handId: "#TX-9980-B", matchId: DEMO_MATCH_ID, handNo: 9980, commit: longHash(9980), status: "verified" },
    { handId: "#TX-9979-A", matchId: DEMO_MATCH_ID, handNo: 9979, commit: longHash(9979), status: "verified" },
    { handId: "#TX-9978-D", matchId: DEMO_MATCH_ID, handNo: 9978, commit: longHash(9978), status: "verified" },
  ];

  const history: AuditHistoryRow[] = HANDS.map((name, i) => {
    const handNo = 882 - i;
    const mins = 2 - i;
    return {
      tableId: `T-${handNo}-${name}`,
      matchId: DEMO_MATCH_ID,
      handNo,
      timestamp: `2023-11-24 14:0${Math.max(0, mins)}:${(11 + i * 7) % 60}`.padEnd(19, "0"),
      publicSeed: `0x${hexChunk(handNo, 3).toUpperCase()}...${hexChunk(handNo + 4, 4).toUpperCase()}`,
      verified: true,
    };
  });

  return {
    demo: true,
    entropy: {
      tableId: "0x882A",
      vrfSample: `0x442${hexChunk(442, 3)}...EF21`,
      masterSeedState: "MIXING_ACTIVE",
      mouseClicks: 42,
      poolBits: 128,
      randomnessScore: 99.98,
      hardwareStatus: "ACTIVE",
    },
    health: {
      operational: true,
      rngLatencyMs: 14,
      ledgerConsistency: "SYNCED",
      activeProofs: 1402,
      anchorConfigured: false,
      anchorTx: null,
      anchorChain: "polygon",
    },
    proofs,
    history,
  };
}

const DEMO_CHRONOLOGY: ChronologyStreet[] = [
  { name: "PRE-FLOP (HOLE CARDS)", cards: ["Ah", "As"] },
  { name: "THE FLOP", cards: ["8h", "3d", "Kc"] },
  { name: "THE TURN", cards: ["8s"] },
  { name: "THE RIVER", cards: ["Ac"] },
];

function cardProof(index: number, label: string, card: string, batch: boolean): CardProof {
  return {
    index,
    label,
    card,
    entropySource: "SHA256-CTR/rs_poker",
    sha256: hexChunk(index * 131 + 7, batch ? 96 : 64),
    serverSeed: "k87v_21m_9q01",
    clientSeed: "vault_user_772",
    nonce: 4912 + index,
    active: true,
  };
}

export function demoHandAudit(): HandAuditData {
  const proofs: CardProof[] = [
    cardProof(1, "Hole 1", "Ah", false),
    cardProof(2, "Hole 2", "As", false),
    cardProof(15, "Flop 1-3", "8h", true),
    cardProof(4, "Turn", "8s", false),
    cardProof(5, "River", "Ac", false),
  ];
  return {
    demo: true,
    sessionId: "88219-X",
    matchId: DEMO_MATCH_ID,
    handNo: DEMO_HAND_NO,
    verifiedPath: true,
    timestamp: "2023.11.24 02:14:55 UTC",
    winningHand: "Full House, Aces over 8s",
    potLabel: "1.245 ETH",
    chronology: DEMO_CHRONOLOGY,
    proofs,
    integrityChecked: true,
    serverSeed: "k87v_21m_9q01",
    clientSeed: "vault_user_772",
    commit: hexChunk(9982, 64),
    revealedSeed: DEMO_SEED,
  };
}

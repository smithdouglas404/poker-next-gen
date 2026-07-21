// Static demo data for the cinematic proof scenes. No Nakama, no RPCs — pure showcase.

export interface ProofSeat {
  index: number;
  name: string;
  stack: string;
  avatar: string; // avatar id -> /avatars/<id>.webp
  ring: string; // neon ring hex
  state: "idle" | "active" | "allin" | "folded" | "winner";
  action?: { label: string; amount?: string; tone: "fold" | "call" | "raise" | "allin" };
  hole?: [string, string]; // shown on some seats
  use3d?: boolean; // in "mix" mode this seat renders a 3D GLB (Tripo) character
  model?: string; // optional per-seat GLB path (Tripo output on Railway)
}

// index 0 = hero (bottom center), clockwise. 9-max.
// use3d marks the seats that own a 3D avatar (mixed table: Tripo 3D + HRC portraits).
export const PROOF_SEATS: ProofSeat[] = [
  { index: 0, name: "You",          stack: "$52,500", avatar: "cyber-samurai", ring: "#f3c14b", state: "active",  action: { label: "RAISE", amount: "$1,200", tone: "raise" }, hole: ["Ah", "Ad"], use3d: true },
  { index: 1, name: "Neon Viper",   stack: "$45,000", avatar: "neon-viper",    ring: "#22d3ee", state: "idle",    action: { label: "CALL",  amount: "$2,500", tone: "call" } },
  { index: 2, name: "Ice Queen",    stack: "$45,000", avatar: "ice-queen",     ring: "#22d3ee", state: "idle",    action: { label: "FOLD",  tone: "fold" } },
  { index: 3, name: "Shadow King",  stack: "$61,300", avatar: "shadow-king",   ring: "#22d3ee", state: "idle",    action: { label: "CALL",  amount: "$1,500", tone: "call" }, use3d: true },
  { index: 4, name: "Void Witch",   stack: "$28,800", avatar: "void-witch",    ring: "#ef4444", state: "allin",   action: { label: "ALL-IN", amount: "$28,800", tone: "allin" } },
  { index: 5, name: "Gold Phantom", stack: "$45,000", avatar: "gold-phantom",  ring: "#22d3ee", state: "idle",    action: { label: "FOLD",  tone: "fold" } },
  { index: 6, name: "Red Wolf",     stack: "$45,000", avatar: "red-wolf",      ring: "#22d3ee", state: "idle" },
  { index: 7, name: "Chrome Siren", stack: "$45,000", avatar: "chrome-siren",  ring: "#22d3ee", state: "idle",    action: { label: "CALL",  amount: "$2,500", tone: "call" }, use3d: true },
  { index: 8, name: "Tech Monk",    stack: "$45,000", avatar: "tech-monk",     ring: "#22d3ee", state: "idle" },
];

// Community board (four-color deck: s=black, h=red, d=blue, c=green).
export const PROOF_BOARD: string[] = ["As", "Kd", "7c", "8h", "2s"];

export const PROOF_HERO_HOLE: [string, string] = ["Ah", "Ad"];

export const POT_LABEL = "$18,650";

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

// index 0 = hero (bottom center), clockwise. 9-max. $50/$100 cash game — stacks
// vary 64–313bb (realistic depth). A legal river spot: Shadow King bet $4,000;
// every caller faces the SAME $4,000; the hero is deciding a legal raise; Void
// Witch is all-in short for $6,400 (a call-all-in, labelled as such).
// use3d marks the seats that own a 3D avatar (mixed table: Tripo 3D + HRC portraits).
export const PROOF_SEATS: ProofSeat[] = [
  { index: 0, name: "You",          stack: "$24,500", avatar: "cyber-samurai", ring: "#f3c14b", state: "active",  action: { label: "RAISE", amount: "$12,000", tone: "raise" }, hole: ["Ah", "Ad"], use3d: true },
  { index: 1, name: "Neon Viper",   stack: "$18,200", avatar: "neon-viper",    ring: "#5b6472", state: "idle",    action: { label: "CALL",  amount: "$4,000", tone: "call" } },
  { index: 2, name: "Ice Queen",    stack: "$9,900",  avatar: "ice-queen",     ring: "#5b6472", state: "folded",  action: { label: "FOLD",  tone: "fold" } },
  { index: 3, name: "Shadow King",  stack: "$31,300", avatar: "shadow-king",   ring: "#5b6472", state: "idle",    action: { label: "BET",   amount: "$4,000", tone: "raise" }, use3d: true },
  { index: 4, name: "Void Witch",   stack: "$6,400",  avatar: "void-witch",    ring: "#ef4444", state: "allin",   action: { label: "ALL-IN", amount: "$6,400", tone: "allin" } },
  { index: 5, name: "Gold Phantom", stack: "$22,100", avatar: "gold-phantom",  ring: "#5b6472", state: "folded",  action: { label: "FOLD",  tone: "fold" } },
  { index: 6, name: "Red Wolf",     stack: "$14,700", avatar: "red-wolf",      ring: "#5b6472", state: "idle" },
  { index: 7, name: "Chrome Siren", stack: "$16,800", avatar: "chrome-siren",  ring: "#5b6472", state: "idle",    action: { label: "CALL",  amount: "$4,000", tone: "call" }, use3d: true },
  { index: 8, name: "Tech Monk",    stack: "$12,300", avatar: "tech-monk",     ring: "#5b6472", state: "idle" },
];

// Community board (four-color deck: s=black, h=red, d=blue, c=green).
export const PROOF_BOARD: string[] = ["As", "Kd", "7c", "8h", "2s"];

export const PROOF_HERO_HOLE: [string, string] = ["Ah", "Ad"];

export const POT_LABEL = "$16,400";

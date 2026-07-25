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
  use3d?: boolean;
  /** Holds the dealer button (top arc of the runway). */
  isButton?: boolean; // in "mix" mode this seat renders a 3D GLB (Tripo) character
  model?: string; // optional per-seat GLB path (Tripo output on Railway)
}

// index 0 = hero (bottom center), clockwise. 9-max. $50/$100 cash game — stacks
// vary 64–313bb (realistic depth). A legal river spot: Shadow King bet $4,000;
// every caller faces the SAME $4,000; the hero is deciding a legal raise; Void
// Witch is all-in short for $6,400 (a call-all-in, labelled as such).
// use3d marks the seats that own a 3D avatar (mixed table: Tripo 3D + HRC portraits).
export const PROOF_SEATS: ProofSeat[] = [
  // Ten seat positions walking the runway: 0 = hero at the near (bottom) curve,
  // 1-4 up the right rail, 5-6 across the far arc (dealer), 7-9 down the left rail.
  // Unoccupied positions are omitted and render as VACANT frames.
  { index: 0, name: "Aces Full of Rings", stack: "$5,250",  avatar: "cyber-samurai", ring: "#f3c14b", state: "active",
    action: { label: "RAISE", amount: "$12,000", tone: "raise" }, hole: ["Ac", "Ah"], use3d: true },
  { index: 2, name: "Queen",              stack: "$1,900",  avatar: "void-witch",    ring: "#ef4444", state: "allin",
    action: { label: "ALL-IN", amount: "$1,000", tone: "allin" } },
  { index: 4, name: "Player 9",           stack: "$100,000", avatar: "tech-monk",    ring: "#5b6472", state: "folded",
    action: { label: "FOLD", tone: "fold" } },
  { index: 5, name: "Player 5",           stack: "$45,000", avatar: "ice-queen",     ring: "#5b6472", state: "idle",
    action: { label: "CALL", amount: "$10,000", tone: "call" }, isButton: true },
  { index: 7, name: "Player 1",           stack: "$45,000", avatar: "shadow-king",   ring: "#5b6472", state: "idle",
    action: { label: "RAISE", amount: "$1,200", tone: "raise" }, use3d: true },
  { index: 8, name: "Trip Kings",         stack: "$2,800",  avatar: "neon-viper",    ring: "#5b6472", state: "idle",
    action: { label: "CALL", amount: "$1,500", tone: "call" } },
];

// Community board (four-color deck: s=black, h=red, d=blue, c=green).
export const PROOF_BOARD: string[] = ["As", "Kd", "7c", "8h", "2s"];

export const PROOF_HERO_HOLE: [string, string] = ["Ah", "Ad"];

export const POT_LABEL = "$16,400";

// Static demo state for /table?demo=1 — a headless-verifiable populated
// cinematic table with no live Nakama server. Values mirror the proof showcase
// (proofData) so the demo reads like the approved reference render.

import type { CardView, ShowdownMessage, TableSnapshot } from "@/features/game/protocol";

// Hero user id — matched by DEMO_PROFILE so heroSeatIndex() finds the hero and
// the scene rotates it to bottom-center. Seat user_ids double as avatar ids so
// avatarDef() resolves the exact proof characters.
export const DEMO_HERO_ID = "cyber-samurai";

export const DEMO_SNAPSHOT: TableSnapshot = {
  match_id: "demo-match",
  room_id: "demo-room",
  phase: "river",
  seats: [
    { index: 0, user_id: "cyber-samurai", username: "You", stack: 5_250_000, status: "active", last_action: "raise" },
    { index: 1, user_id: "neon-viper", username: "Neon Viper", stack: 4_500_000, status: "active", last_action: "call" },
    { index: 2, user_id: "ice-queen", username: "Ice Queen", stack: 4_500_000, status: "folded", last_action: "fold" },
    { index: 3, user_id: "shadow-king", username: "Shadow King", stack: 6_130_000, status: "active", last_action: "call" },
    { index: 4, user_id: "void-witch", username: "Void Witch", stack: 2_880_000, status: "all-in", last_action: "all-in" },
    { index: 5, user_id: "gold-phantom", username: "Gold Phantom", stack: 4_500_000, status: "folded", last_action: "fold" },
    { index: 6, user_id: "red-wolf", username: "Red Wolf", stack: 4_500_000, status: "active" },
    { index: 7, user_id: "chrome-siren", username: "Chrome Siren", stack: 4_500_000, status: "active", last_action: "call" },
    { index: 8, user_id: "tech-monk", username: "Tech Monk", stack: 4_500_000, status: "active" },
  ],
  board: [
    { code: "As", face_up: true },
    { code: "Kd", face_up: true },
    { code: "7c", face_up: true },
    { code: "8h", face_up: true },
    { code: "2s", face_up: true },
  ],
  pot: 1_865_000,
  current_bet: 250_000,
  action_seat: 0,
  button_seat: 1,
  small_blind: 500,
  big_blind: 1_000,
  max_seats: 9,
  hand_no: 12_847,
};

export const DEMO_HOLE: CardView[] = [
  { code: "Ah", face_up: true },
  { code: "Ad", face_up: true },
];

export const DEMO_SHOWDOWN: ShowdownMessage | null = null;

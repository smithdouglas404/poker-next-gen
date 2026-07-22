// Shared cryptographic helpers used by BOTH the live and demo paths so the two
// never diverge: combined-seed derivation and local deck reproduction lean on
// the same WebCrypto shuffle the server runs (features/provably/fairDemo.ts).
import { commitmentOf, reproduceDeck, verifyLocally } from "@/features/provably/fairDemo";

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** SHA-256(revealed_server_seed ‖ ":" ‖ player_seed) — the mixed entropy that
 *  actually seeds the shuffle once both parties' contributions are known. */
export async function combineSeeds(serverSeedHex: string, playerSeed: string): Promise<string> {
  const enc = new TextEncoder();
  const server = serverSeedHex.trim().toLowerCase().replace(/^0x/, "");
  const material = enc.encode(`${server}:${playerSeed}`);
  const view = new Uint8Array(material);
  const buf = await crypto.subtle.digest("SHA-256", view.buffer as ArrayBuffer);
  return `0x${bytesToHex(new Uint8Array(buf))}`;
}

export { commitmentOf, reproduceDeck, verifyLocally };

/** SHA-256 of an arbitrary UTF-8 string, hex-encoded. Used to derive a per-card
 *  proof digest from (seed ‖ index) so the hand-audit cards show a real hash. */
export async function sha256Hex(input: string): Promise<string> {
  const material = new Uint8Array(new TextEncoder().encode(input));
  const buf = await crypto.subtle.digest("SHA-256", material.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(buf));
}

const RANK_NAMES: Record<string, string> = {
  A: "Ace", K: "King", Q: "Queen", J: "Jack", T: "Ten", "9": "Nine", "8": "Eight",
  "7": "Seven", "6": "Six", "5": "Five", "4": "Four", "3": "Three", "2": "Two",
};

/** A cheap "what did this look like" descriptor for the reproduced deal — used
 *  for the RESULTING HAND readout. Not a full evaluator; the authoritative hand
 *  strength comes from engine-math server-side. */
export function describeHoleCards(cards: string[]): { label: string; prob: string } {
  if (cards.length < 2) return { label: "—", prob: "" };
  const [a, b] = cards;
  const ra = a[0];
  const rb = b[0];
  const suited = a[1] === b[1];
  if (ra === rb) return { label: `Pocket ${RANK_NAMES[ra] ?? ra}s`, prob: "0.45% Prob." };
  const combo = `${RANK_NAMES[ra] ?? ra}-${RANK_NAMES[rb] ?? rb}`;
  if (ra === "A" && rb === "K") return { label: suited ? "Big Slick (s)" : "Big Slick", prob: "0.0001% Royal Out" };
  return { label: `${combo}${suited ? " (s)" : ""}`, prob: suited ? "0.24% Prob." : "0.90% Prob." };
}

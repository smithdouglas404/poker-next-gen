// fairDemo.ts — a byte-for-byte WebCrypto reimplementation of the server's real
// shuffle (SHA-256 CTR keystream → Fisher-Yates) and its commitment
// (SHA-256 of the seed bytes). This lets the browser independently reproduce the
// exact deck the server dealt and confirm the pre-deal commitment — no trust in
// our servers required. It mirrors engine-math and the stdlib Python verifier
// shipped from this screen; all three must agree.

const RANKS = "23456789TJQKA";
const SUITS = "shdc";

/** The canonical ordered 52-card deck (rank-major), pre-shuffle. */
export function orderedDeck(): string[] {
  const out: string[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(r + s);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error("seed must be an even-length hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * 8-byte little-endian encoding of a counter (matches Go's binary.LittleEndian /
 * Python's '<Q'). The keystream counter for a 52-card shuffle never exceeds a few
 * hundred, so the high 32 bits are always zero — we encode the low 32 bits and
 * leave the rest at zero, avoiding BigInt (unavailable at this compile target).
 */
function packU64LE(n: number): Uint8Array {
  const b = new Uint8Array(8);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

/** Little-endian uint32 read (matches Python's '<I'). */
function u32LE(b: Uint8Array, off: number): number {
  return ((b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new Uint8Array(bytes); // fresh, contiguous ArrayBuffer-backed copy
  const buf = await crypto.subtle.digest("SHA-256", view.buffer as ArrayBuffer);
  return new Uint8Array(buf);
}

/** SHA-256(seed_bytes) — the value the server commits to BEFORE the deal. */
export async function commitmentOf(seedHex: string): Promise<string> {
  return bytesToHex(await sha256(hexToBytes(seedHex)));
}

/**
 * Reproduce the exact 52-card deal order from the revealed seed using the same
 * SHA-256-CTR keystream + Fisher-Yates the server ran. Deterministic — the same
 * seed always yields the same deck.
 */
export async function reproduceDeck(seedHex: string): Promise<string[]> {
  const seed = hexToBytes(seedHex);
  const cards = orderedDeck();
  const n = cards.length;
  let counter = 0;
  let block = await sha256(concat(seed, packU64LE(counter)));
  counter += 1;
  let off = 0;
  for (let i = n - 1; i > 0; i--) {
    if (off + 4 > block.length) {
      block = await sha256(concat(seed, packU64LE(counter)));
      counter += 1;
      off = 0;
    }
    const w = u32LE(block, off);
    off += 4;
    const j = w % (i + 1);
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
  return cards;
}

export interface LocalVerification {
  seed: string;
  computedCommit: string;
  commitMatches: boolean;
  deck: string[];
}

/**
 * Run the full local verification: recompute the commitment from the seed and
 * reproduce the deck. `expectedCommit` (from the server's audit record) is
 * compared against the value we independently derive here in the browser.
 */
export async function verifyLocally(seedHex: string, expectedCommit: string): Promise<LocalVerification> {
  const computedCommit = await commitmentOf(seedHex);
  const deck = await reproduceDeck(seedHex);
  return {
    seed: seedHex.trim().toLowerCase(),
    computedCommit,
    commitMatches: expectedCommit.trim().toLowerCase() === computedCommit,
    deck,
  };
}

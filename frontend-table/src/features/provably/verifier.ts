// Downloadable, dependency-free verifiers a player can run themselves to confirm
// a hand was dealt fairly. The Python script (stdlib `hashlib` only) reproduces
// the exact shuffle from the revealed seed and checks it against the pre-deal
// commitment — byte-for-byte identical to engine-math and fairDemo.ts.

/** The human-readable algorithm, shown on-screen and embedded in downloads. */
export const ALGORITHM_STEPS: { title: string; detail: string }[] = [
  {
    title: "Seed",
    detail: "A cryptographically-random 32-byte seed is drawn from the OS CSPRNG (crypto/rand).",
  },
  {
    title: "Commit",
    detail: "The server publishes SHA-256(seed) BEFORE any card is dealt — it can no longer change the seed.",
  },
  {
    title: "Keystream",
    detail: "SHA-256(seed ‖ counter₆₄ₗₑ) is run in counter (CTR) mode to produce an unbiased keystream.",
  },
  {
    title: "Shuffle",
    detail: "A Fisher-Yates pass over the ordered 52-card deck draws swap indices from the keystream.",
  },
  {
    title: "Reveal",
    detail: "After the hand the seed is revealed. Anyone re-hashes it and re-runs the shuffle to confirm.",
  },
];

/** The entropy that feeds the shuffle — surfaced as the "Shuffle Verified" sources. */
export const ENTROPY_SOURCES: { label: string; detail: string }[] = [
  { label: "OS CSPRNG", detail: "32 bytes from crypto/rand (getrandom / /dev/urandom)" },
  { label: "SHA-256 CTR", detail: "Keystream = SHA-256(seed ‖ counter), counter little-endian uint64" },
  { label: "Fisher-Yates", detail: "Unbiased in-place permutation of the 52-card deck" },
  { label: "Pre-deal commit", detail: "SHA-256(seed) is anchored before cards leave the server" },
];

export function pythonVerifier(commit: string, seed: string): string {
  return `#!/usr/bin/env python3
# High Rollers Club - provably-fair hand verifier (stdlib only).
# Reproduces the shuffle from the revealed seed and checks the pre-deal commit.
import hashlib, struct

COMMITMENT = "${commit}"   # published BEFORE the deal (SHA-256 of the seed)
SEED       = "${seed}"     # revealed AFTER the hand

RANKS = "23456789TJQKA"
SUITS = "shdc"

def ordered():
    return [r + s for r in RANKS for s in SUITS]

def shuffle(seed_hex):
    seed = bytes.fromhex(seed_hex)
    cards = ordered()
    n = len(cards)
    counter = 0
    block = hashlib.sha256(seed + struct.pack('<Q', counter)).digest(); counter += 1
    off = 0
    for i in range(n - 1, 0, -1):
        if off + 4 > len(block):
            block = hashlib.sha256(seed + struct.pack('<Q', counter)).digest(); counter += 1
            off = 0
        w = struct.unpack_from('<I', block, off)[0]; off += 4
        j = w % (i + 1)
        cards[i], cards[j] = cards[j], cards[i]
    return cards

if __name__ == "__main__":
    commit_ok = hashlib.sha256(bytes.fromhex(SEED)).hexdigest() == COMMITMENT.lower()
    deck = shuffle(SEED)
    print("Commitment matches revealed seed:", commit_ok)
    print("  (the operator committed to this seed before any card was dealt)")
    print("Reproduced 52-card deck (deal order):")
    print("  " + " ".join(deck))
    print()
    print("Your hole cards and the board must appear in this deck as dealt.")
    print("If the commitment matches, the deck could not have been rigged.")
`;
}

/** A machine-readable proof bundle for the exact hand being verified. */
export function proofBundle(input: {
  matchId: string;
  handNo: number;
  commit: string;
  seed: string;
  deck: string[];
  chainValid?: boolean;
  deckValid?: boolean;
  verifyMethod?: string;
}): string {
  return JSON.stringify(
    {
      schema: "hrc.provably-fair.v1",
      match_id: input.matchId,
      hand_no: input.handNo,
      commitment: input.commit,
      revealed_seed: input.seed,
      algorithm: "sha256-ctr/fisher-yates",
      chain_valid: input.chainValid ?? null,
      deck_valid: input.deckValid ?? null,
      verify_method: input.verifyMethod ?? null,
      reproduced_deck: input.deck,
      note: "commitment = SHA-256(revealed_seed). Re-run the shuffle to reproduce reproduced_deck.",
    },
    null,
    2,
  );
}

/** Trigger a client-side file download (no network, no server involvement). */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

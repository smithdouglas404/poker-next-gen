"use client";

import { useCallback, useState } from "react";

import { useGame } from "@/features/game/GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface VerifyResult {
  chain_valid?: boolean;
  deck_valid?: boolean;
  deck_commit?: string;
  deck_revealed?: boolean;
  reveal_seed?: string;
  verify_method?: string;
  chain_errors?: string[];
  event_count?: number;
}

/**
 * A self-contained pure-Python verifier (hashlib only, no dependencies) that
 * reproduces the exact deck from the revealed seed and confirms the pre-deal
 * commitment. Mirrors engine-math's SHA-256 CTR → Fisher-Yates shuffle
 * byte-for-byte (cross-checked in CI).
 */
function pythonVerifier(commit: string, seed: string): string {
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

export function HandVerifyPanel() {
  const { matchId, roomId, snapshot, showdown } = useGame();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyHand = useCallback(async () => {
    const auditKey = roomId || matchId;
    if (!auditKey || !snapshot?.hand_no) {
      setError("Join a table and complete a hand first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = (await callSessionRpc("audit_verify_hand", {
        match_id: auditKey,
        hand_no: snapshot.hand_no,
      })) as VerifyResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setLoading(false);
    }
  }, [matchId, roomId, snapshot?.hand_no]);

  const commit = showdown?.deck_commit || snapshot?.deck_commit_hash;
  const revealedSeed = showdown?.reveal_seed || result?.reveal_seed;

  const downloadVerifier = useCallback(() => {
    if (!commit || !revealedSeed) return;
    const blob = new Blob([pythonVerifier(commit, revealedSeed)], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verify-hand-${snapshot?.hand_no ?? "latest"}.py`;
    a.click();
    URL.revokeObjectURL(url);
  }, [commit, revealedSeed, snapshot?.hand_no]);

  return (
    <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Provably fair</p>
        <span
          className="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-[9px] font-bold text-emerald-300"
          title={revealedSeed ? "Seed revealed — the shuffle is fully re-runnable" : "Deck committed before the deal"}
        >
          {revealedSeed ? "🔓 Verifiable" : "🔒 Committed"}
        </span>
      </div>

      {commit ? (
        <p className="mt-1 break-all font-mono text-[10px] text-amber-200/90" title={commit}>
          Commit: {commit.slice(0, 16)}…
        </p>
      ) : (
        <p className="mt-1 text-neutral-500">No active hand commitment</p>
      )}
      {revealedSeed && (
        <p className="mt-0.5 break-all font-mono text-[10px] text-cyan-200/80" title={revealedSeed}>
          Seed: {revealedSeed.slice(0, 16)}…
        </p>
      )}

      <button
        type="button"
        onClick={verifyHand}
        disabled={loading || !(roomId || matchId)}
        className="mt-2 w-full rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-40"
      >
        {loading ? "Verifying…" : "Verify hand audit"}
      </button>
      <button
        type="button"
        onClick={downloadVerifier}
        disabled={!commit || !revealedSeed}
        title={!revealedSeed ? "Available once the hand reaches showdown" : "Download a stdlib-only Python verifier"}
        className="mt-1.5 w-full rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-2 py-1.5 text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-40"
      >
        ⬇ Re-verify in Python
      </button>

      {error && <p className="mt-2 text-red-300">{error}</p>}
      {result && (
        <ul className="mt-2 space-y-1 text-neutral-400">
          <li>Events: {result.event_count ?? 0}</li>
          <li>Chain: {result.chain_valid ? "valid ✓" : "invalid ✗"}</li>
          <li>
            Deck:{" "}
            {result.deck_revealed ? (result.deck_valid ? "valid ✓" : "invalid ✗") : "pending reveal"}
            {result.verify_method && result.verify_method !== "none" ? ` (${result.verify_method})` : ""}
          </li>
          {result.chain_errors?.map((e) => (
            <li key={e} className="text-red-300">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

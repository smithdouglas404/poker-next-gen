"use client";

import { useCallback, useState } from "react";

import { useGame } from "@/features/game/GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface VerifyResult {
  chain_valid?: boolean;
  deck_valid?: boolean;
  deck_commit?: string;
  deck_revealed?: boolean;
  chain_errors?: string[];
  event_count?: number;
}

export function HandVerifyPanel() {
  const { matchId, roomId, snapshot } = useGame();
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

  const commit = snapshot?.deck_commit_hash;

  return (
    <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/50 p-3 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Provably fair</p>
      {commit ? (
        <p className="mt-1 break-all font-mono text-[10px] text-amber-200/90" title={commit}>
          Deck commit: {commit.slice(0, 12)}…
        </p>
      ) : (
        <p className="mt-1 text-neutral-500">No active hand commitment</p>
      )}
      <button
        type="button"
        onClick={verifyHand}
        disabled={loading || !(roomId || matchId)}
        className="mt-2 w-full rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-40"
      >
        {loading ? "Verifying…" : "Verify hand audit"}
      </button>
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {result && (
        <ul className="mt-2 space-y-1 text-neutral-400">
          <li>Events: {result.event_count ?? 0}</li>
          <li>Chain: {result.chain_valid ? "valid" : "invalid"}</li>
          <li>Deck: {result.deck_revealed ? (result.deck_valid ? "valid" : "invalid") : "pending reveal"}</li>
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

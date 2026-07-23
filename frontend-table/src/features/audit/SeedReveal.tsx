"use client";

import { useCallback, useEffect, useState } from "react";

import { BTN_RED, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { downloadFile, proofBundle } from "@/features/provably/verifier";
import { PlayingCard } from "./Card";
import { auditVerifyHand } from "./auditRpc";
import { describeHoleCards, verifyLocally } from "./auditCompute";
import { DEMO_HAND_NO, DEMO_MATCH_ID, DEMO_SEED, DEMO_SESSION_ID, demoHandAudit } from "./auditDemo";
import type { RevealResult } from "./auditTypes";

interface Props {
  /** Optional hand pre-selected from the dashboard's "Reveal Proof" action. */
  target?: { matchId: string; handNo: number } | null;
}

// Provably-fair reveal. NOTHING on this path is user-editable: the deck is a pure
// function of the server seed, which is committed (SHA-256 hash) BEFORE the deal
// and revealed AFTER. The browser recomputes the deck from the revealed seed and
// checks it against the pre-committed hash. There is no client-typed seed — a
// seed entered after the hand could not influence a shuffle that already
// happened, so offering that field would be provably-fair theater.
export function SeedReveal({ target }: Props) {
  const [result, setResult] = useState<RevealResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedHash, setLockedHash] = useState<string>(demoHandAudit().commit);
  const [sessionId, setSessionId] = useState<string>(DEMO_SESSION_ID);
  const matchId = target?.matchId ?? DEMO_MATCH_ID;
  const handNo = target?.handNo ?? DEMO_HAND_NO;

  // Pull the pre-committed (locked) server-seed hash for the selected hand so the
  // panel shows the real commitment before reveal.
  useEffect(() => {
    let alive = true;
    void auditVerifyHand(matchId, handNo)
      .then((v) => {
        if (!alive) return;
        if (v.deck_commit) setLockedHash(v.deck_commit);
        if (v.match_id) setSessionId(`${v.match_id.slice(0, 8)}-${v.hand_no ?? handNo}`.toUpperCase());
      })
      .catch(() => {
        /* offline: keep demo commitment */
      });
    return () => {
      alive = false;
    };
  }, [matchId, handNo]);

  const reveal = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    try {
      let demo = false;
      let commit = lockedHash;
      let revealedSeed = "";
      let chainValid = false;
      let deckValid = false;
      let verifyMethod = "sha256-ctr/fisher-yates";
      try {
        const v = await auditVerifyHand(matchId, handNo);
        if (v.deck_commit) commit = v.deck_commit;
        if (v.reveal_seed) revealedSeed = v.reveal_seed;
        chainValid = Boolean(v.chain_valid);
        deckValid = Boolean(v.deck_valid);
        if (v.verify_method) verifyMethod = v.verify_method;
        if (!revealedSeed) {
          // Server hasn't revealed yet (hand not finished / no auth) → demo.
          demo = true;
          revealedSeed = DEMO_SEED;
        }
      } catch {
        demo = true;
        revealedSeed = DEMO_SEED;
        commit = demoHandAudit().commit;
      }

      // Independent, in-browser reproduction — the trust-nothing step. The deck
      // is derived solely from the revealed server seed.
      const local = await verifyLocally(revealedSeed, commit);
      const holeCards = [local.deck[0], local.deck[1]];
      const desc = describeHoleCards(holeCards);
      const latency = Math.max(1, Math.round(performance.now() - started));

      setResult({
        demo,
        matchId,
        handNo,
        sessionId,
        serverSeedHash: commit,
        revealedSeed,
        playerSeed: "",
        combinedSeed: "",
        chainValid: demo ? true : chainValid,
        deckValid: demo ? local.commitMatches : deckValid,
        commitMatches: local.commitMatches,
        verifyMethod,
        deck: local.deck,
        resultingCards: holeCards,
        handLabel: desc.label,
        handProb: desc.prob,
        node: "PRIME-ALPHA",
        latencyMs: latency,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    } finally {
      setBusy(false);
    }
  }, [lockedHash, matchId, handNo, sessionId]);

  const downloadJson = useCallback(() => {
    if (!result) return;
    const base = proofBundle({
      matchId: result.matchId,
      handNo: result.handNo,
      commit: result.serverSeedHash,
      seed: result.revealedSeed,
      deck: result.deck,
      chainValid: result.chainValid,
      deckValid: result.deckValid,
      verifyMethod: result.verifyMethod,
    });
    const merged = JSON.stringify(
      {
        ...JSON.parse(base),
        session_id: result.sessionId,
        resulting_hole_cards: result.resultingCards,
        source: result.demo ? "demo" : "live",
      },
      null,
      2,
    );
    downloadFile(`seed-reveal-${result.sessionId}.json`, merged, "application/json");
  }, [result]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className={cn(GLASS_PANEL, "p-8 md:p-10")}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className={cn(HEADING_SM, "flex items-center gap-2 text-green/80")}>
              <span className="text-green">▪</span> Secure Protocol V2.4
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-wide">Seed Reveal</h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Game Session ID</div>
            <div className="mt-1 font-mono text-sm text-muted">#{sessionId}</div>
          </div>
        </div>

        {/* What does this prove? */}
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-neutral-400">
          <span className="font-semibold text-neutral-200">What does this prove?</span> Before the hand was dealt, the
          server published a SHA-256 hash of its secret shuffle seed (below). After the hand, it revealed the seed. Your
          browser recomputes the deck from that seed and checks it hashes to the pre-committed value — so the cards could
          not have been changed after betting began. Nothing here is editable: the deck is a pure function of the
          committed server seed.
        </div>

        {/* Locked server seed hash */}
        <div className="mt-6 rounded-2xl border-l-2 border-brand/50 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <span className={cn(HEADING_SM, "text-foreground")}>Server Seed Hash (committed pre-deal)</span>
            <span className="text-neutral-500">🔒</span>
          </div>
          <div className="mt-3 break-all rounded-lg bg-black/60 p-4 font-mono text-xs leading-relaxed text-neutral-300">
            {lockedHash.replace(/^0x/, "")}
          </div>
          <p className="mt-3 text-xs italic text-neutral-500">
            Published during the initial deal. The reveal below discloses the seed behind this hash.
          </p>
        </div>

        {/* Reveal (no editable input — verify is read-only) */}
        <div className="mt-6">
          <button
            onClick={reveal}
            disabled={busy}
            className={cn(
              BTN_RED,
              "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50",
            )}
          >
            {busy ? "Verifying…" : "Reveal seed & verify deck"} <span>🛡</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-8 border-t border-white/[0.06] pt-8">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl text-lg",
                  result.commitMatches ? "bg-green/15 text-green" : "bg-brand/15 text-brand",
                )}
              >
                {result.commitMatches ? "✔" : "✕"}
              </div>
              <div>
                <h2 className={cn("font-display text-lg font-bold uppercase tracking-wider", result.commitMatches ? "text-green" : "text-brand")}>
                  {result.commitMatches ? "Verification Success" : "Verification Failed"}
                </h2>
                <p className="text-sm text-neutral-400">
                  {result.commitMatches
                    ? "Reproduced in your browser: revealed seed hashes to the pre-committed value."
                    : "Reproduced commitment did not match the locked hash."}
                </p>
              </div>
              {result.demo && (
                <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                  Demo · offline
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={cn(GLASS_PANEL, "p-5")}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Revealed Server Seed</div>
                <div className="mt-3 break-all rounded-lg bg-black/50 p-3 font-mono text-xs text-green">
                  {result.revealedSeed.replace(/^0x/, "").slice(0, 12)}…{result.revealedSeed.replace(/^0x/, "").slice(-16)}
                </div>
                <p className="mt-2 text-[10px] text-neutral-500">Recompute method: {result.verifyMethod}</p>
              </div>
              <div className={cn(GLASS_PANEL, "p-5")}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Recomputed Hole Cards</div>
                <div className="mt-3 flex items-center gap-3">
                  <PlayingCard card={result.resultingCards[0]} size="sm" />
                  <PlayingCard card={result.resultingCards[1]} size="sm" />
                  <div className="ml-auto text-right">
                    <div className="font-display text-sm font-bold uppercase tracking-wider text-gold">
                      {result.handLabel}
                    </div>
                    <div className="text-[10px] text-neutral-500">{result.handProb}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-green/30 bg-green/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-green" /> Node: {result.node}
                </span>
                <span className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Lat: {result.latencyMs}ms
                </span>
              </div>
              <button
                onClick={downloadJson}
                className="text-xs font-bold uppercase tracking-wider text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
              >
                Download Full JSON Log
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

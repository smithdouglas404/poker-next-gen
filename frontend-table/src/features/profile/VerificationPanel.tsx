"use client";

// Provably-fair verification, rehomed from the felt.
//
// The table used to carry a "blockchain" panel showing a hardcoded hash string —
// decoration, not proof. That panel came off the felt; this is its real home,
// and it is wired to the actual audit stack: hand_history for the caller's own
// hands, audit_verify_hand for the chain + deck-commitment check. A player picks
// one of THEIR hands and gets a genuine verdict, not a constant.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { auditVerifyHand, handHistory } from "@/features/audit/auditRpc";
import type { HandIndexRow, VerifyResult } from "@/features/provably/types";
import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { RISE, STAGGER, STAGGER_ITEM } from "@/features/ui/motion";

interface Props {
  notify: (msg: string, kind?: "ok" | "err") => void;
}

/**
 * A hand passes only when BOTH halves of the proof hold: the hash-chained event
 * log re-walks cleanly AND the revealed seed reproduces the committed deck. The
 * RPC reports them separately (there is no single `ok`), and treating either one
 * alone as "verified" would be a false green.
 */
function passed(r: VerifyResult | undefined): boolean {
  return !!r && r.chain_valid === true && r.deck_valid === true;
}

/** Hashes are long; show enough to compare by eye without wrapping the row. */
function shortHash(h: string | undefined): string {
  if (!h) return "—";
  return h.length <= 18 ? h : `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export function VerificationPanel({ notify }: Props) {
  const [hands, setHands] = useState<HandIndexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerifyResult>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await handHistory(15);
        if (!cancelled) setHands(r?.hands ?? []);
      } catch (e) {
        if (!cancelled) notify(e instanceof Error ? e.message : "Failed to load hands", "err");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const verify = useCallback(
    (h: HandIndexRow) => {
      const key = `${h.match_id}:${h.hand_no}`;
      setVerifying(key);
      void (async () => {
        try {
          // room_id is the audit key where present (matches HandVerifyPanel).
          const res = await auditVerifyHand(h.room_id || h.match_id, h.hand_no);
          setResults((r) => ({ ...r, [key]: res }));
          notify(
            passed(res)
              ? "Hand verified — event chain and deck commitment both check out."
              : "Verification failed — the chain or the deck commitment did not match.",
            passed(res) ? "ok" : "err",
          );
        } catch (e) {
          notify(e instanceof Error ? e.message : "Verification failed", "err");
        } finally {
          setVerifying(null);
        }
      })();
    },
    [notify],
  );

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-6">
      <motion.section variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "p-6")}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
          <div>
            <p className={cn(HEADING_SM, "text-muted")}>Provably Fair</p>
            <p className="mt-1 text-[13px] text-neutral-400">
              Every hand commits to its shuffled deck before the first card is dealt, and the seed
              is revealed after. Verifying re-derives the deck from the revealed seed and re-walks
              the hash-chained event log — if either disagrees, the check fails.
            </p>
            <Link
              href="/provably-fair"
              className="mt-2 inline-block text-[12px] text-cyan underline-offset-2 hover:underline"
            >
              How verification works →
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section variants={RISE} className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "mb-4 text-muted")}>Your Hands</p>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading your hand index…</p>
        ) : hands.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hands recorded yet — play a hand and it will appear here for verification.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {hands.map((h) => {
              const key = `${h.match_id}:${h.hand_no}`;
              const res = results[key];
              return (
                <li key={key} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-neutral-200">
                      {h.table_label || "Table"} · hand #{h.hand_no}
                    </span>
                    <span className="block font-mono text-[11px] text-neutral-600">
                      commit {shortHash(h.deck_commit)}
                      {h.anchored && <span className="ml-2 text-cyan">· anchored on-chain</span>}
                    </span>
                  </span>

                  {res && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[12px] font-semibold",
                        passed(res) ? "text-green" : "text-[#ff2d3f]",
                      )}
                    >
                      {passed(res) ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {passed(res) ? "Verified" : "Mismatch"}
                    </span>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => verify(h)}
                    disabled={verifying === key}
                    className="shrink-0 px-3 py-1.5 text-xs"
                  >
                    {verifying === key ? "Checking…" : res ? "Re-check" : "Verify"}
                  </Button>

                  <Link
                    href={`/provably-fair/hand/${encodeURIComponent(h.room_id || h.match_id)}/${h.hand_no}`}
                    className="shrink-0 text-[12px] text-neutral-400 underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Details
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </motion.div>
  );
}

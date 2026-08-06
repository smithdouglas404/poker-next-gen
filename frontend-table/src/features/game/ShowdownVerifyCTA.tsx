"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useGame } from "@/features/game/GameProvider";
import { auditVerifyHand } from "@/features/audit/auditRpc";

// A one-tap "verify this hand" moment that appears at showdown — trust surfaced
// at the emotional peak of the hand. Pure surfacing of the existing
// audit_verify_hand RPC + the /provably-fair/hand/[matchId]/[handNo] deep-link;
// complements the always-on HandVerifyPanel with a prominent, transient CTA.
// The audit key is the ROOM id (falls back to match id) — matches HandVerifyPanel.
export function ShowdownVerifyCTA() {
  const { matchId, roomId, snapshot, showdown } = useGame();
  const [state, setState] = useState<"idle" | "checking" | "ok" | "bad">("idle");

  const auditKey = roomId || matchId;
  const handNo = snapshot?.hand_no;

  // Reset when a new hand starts (showdown cleared) or the hand number changes.
  useEffect(() => {
    setState("idle");
  }, [handNo, showdown]);

  const verify = useCallback(async () => {
    if (!auditKey || !handNo) return;
    setState("checking");
    try {
      const res = await auditVerifyHand(auditKey, handNo);
      setState(res.deck_valid && res.chain_valid ? "ok" : "bad");
    } catch {
      setState("bad");
    }
  }, [auditKey, handNo]);

  if (!showdown || !auditKey || !handNo) return null;

  return (
    <div className="pointer-events-auto fixed left-1/2 top-[16%] z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-cyan/30 bg-surface/90 px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan">
          🔓 Provably fair
        </span>

        {state === "ok" ? (
          <span className="text-xs font-semibold text-green">Verified ✓ deck &amp; chain valid</span>
        ) : state === "bad" ? (
          <span className="text-xs font-semibold text-gold-lite">Verification issue — see full audit</span>
        ) : (
          <button
            type="button"
            onClick={verify}
            disabled={state === "checking"}
            className="rounded-lg border border-green/40 bg-green/10 px-3 py-1 text-xs font-semibold text-[#bff5d3] hover:bg-green/20 disabled:opacity-40"
          >
            {state === "checking" ? "Verifying…" : "Verify this hand"}
          </button>
        )}

        <Link
          href={`/provably-fair/hand/${encodeURIComponent(auditKey)}/${handNo}`}
          className="text-[11px] font-semibold text-cyan hover:underline"
        >
          Full audit →
        </Link>
      </div>
    </div>
  );
}

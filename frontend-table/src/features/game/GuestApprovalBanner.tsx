"use client";

// What the waiting guest sees.
//
// The sit-down gate refuses a coded guest with no account until an operator
// approves them. Without this they get one toast that disappears and are then
// left staring at a table with no idea whether anyone is coming — which reads
// as "the site is broken", not "someone is checking who you are".
//
// Polls guest_approval_status, which is deliberately NOT operator-gated: it
// answers only about the caller's own request.

import { useEffect, useState } from "react";

import { useGame } from "./GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

export function GuestApprovalBanner() {
  const { guestApprovalPending, clearGuestApprovalPending, matchId } = useGame();
  const [status, setStatus] = useState<"pending" | "approved" | "denied" | "none">("pending");

  useEffect(() => {
    if (!guestApprovalPending || !matchId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = (await callSessionRpc("guest_approval_status", { match_id: matchId })) as {
          status?: "pending" | "approved" | "denied" | "none";
        };
        if (cancelled || !r.status) return;
        setStatus(r.status);
        // Approved: drop the banner so the seat markers are clickable again and
        // the player just sits. Denied stays on screen — silently vanishing
        // would look identical to being approved.
        if (r.status === "approved") clearGuestApprovalPending();
      } catch {
        /* offline — keep showing the last known state rather than guessing */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [guestApprovalPending, matchId, clearGuestApprovalPending]);

  if (!guestApprovalPending) return null;

  const denied = status === "denied";

  return (
    <div
      className="pointer-events-auto fixed left-1/2 top-24 z-50 w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl border p-4 text-center"
      style={{
        background: "rgba(10,10,12,0.92)",
        borderColor: denied ? "rgba(245,197,24,0.5)" : "rgba(212,175,55,0.45)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}
      role="status"
      aria-live="polite"
    >
      <p
        className="font-display text-xs font-black uppercase tracking-[0.2em]"
        style={{ color: denied ? "#ff6b73" : "#ffd700" }}
      >
        {denied ? "Not approved" : "Waiting for approval"}
      </p>
      <p className="mt-2 text-sm text-muted">
        {denied
          ? "A table admin declined this request. You can keep watching, but you can't take a seat at this table."
          : "You joined with a table code but don't have an account yet, so a table admin has to approve you before you can sit. You can keep watching while you wait."}
      </p>
      {denied && (
        <button
          type="button"
          onClick={clearGuestApprovalPending}
          className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted transition hover:text-foreground"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

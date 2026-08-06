"use client";

import { useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";

/**
 * How many coded guests are waiting for permission to SIT at this club.
 *
 * This is the one operator queue where latency has a cost to a real person: the
 * sit-down gate in `match/holdem/handler.go` holds the guest on the felt, not
 * seated, until someone decides. Open flags and pending KYC are review-when-you
 * -can; this one is somebody watching a table they cannot join.
 *
 * Returns 0 — which renders NO badge — for every uncertain case: no club
 * selected, the RPC failed, or the caller is not a club configurer (the server
 * refuses `guest_approvals_pending` for anyone else, and that refusal arrives
 * here as an error). A count is authoritative server state or it is absent;
 * never a fabricated zero dressed up as "all clear" (non-negotiable 3).
 */
export function useGuestApprovalCount(clubId: string | null | undefined, pollMs = 30_000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!clubId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    async function read() {
      try {
        const data = await ownerApi.guestApprovalsPending(clubId!);
        if (!cancelled) setCount(typeof data?.count === "number" ? data.count : 0);
      } catch {
        // Not a configurer, offline, or the club went away. No badge.
        if (!cancelled) setCount(0);
      }
    }

    void read();
    const timer = window.setInterval(read, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [clubId, pollMs]);

  return count;
}

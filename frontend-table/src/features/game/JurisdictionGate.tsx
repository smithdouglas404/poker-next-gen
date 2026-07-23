"use client";

import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Client-side jurisdiction gate. Calls jurisdiction_check on mount and, if the
// player's region is blocked, covers the table with a clear message instead of
// letting them reach a seat and hit a silent failure. This is UX only — the
// server re-checks at table creation and every deposit (that is the real
// boundary); a blocked region can never move money regardless of this overlay.
export function JurisdictionGate() {
  const [blocked, setBlocked] = useState<{ reason: string; country: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await callSessionRpc("jurisdiction_check", {})) as {
          allowed?: boolean;
          country?: string;
          reason?: string;
        };
        if (!cancelled && res && res.allowed === false) {
          setBlocked({ reason: res.reason || "Play is not available in your region.", country: res.country || "" });
        }
      } catch {
        // Fail-open on the client: the server still enforces at the money edges.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blocked) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-6 backdrop-blur-md">
      <div className={cn(GLASS_PANEL, "w-full max-w-md p-8 text-center")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-400">Region restricted</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Play isn&apos;t available here</h2>
        <p className="mt-3 text-sm text-neutral-300">{blocked.reason}</p>
        {blocked.country && (
          <p className="mt-2 text-xs text-neutral-500">Detected region: {blocked.country}</p>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          If you believe this is a mistake, contact support — real-money actions are disabled for restricted regions.
        </p>
      </div>
    </div>
  );
}

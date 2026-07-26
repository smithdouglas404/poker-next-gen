"use client";

// Demo data is OPT-IN, never a fallback.
//
// Screens used to substitute a fabricated dataset whenever an RPC failed or
// returned nothing: a club with 12 named members and $184M in balances, a
// $9,000,000 sponsorship payout, a full rake ledger. None of it was real. A
// player or operator hitting a network blip saw invented money and could not
// tell. That violates the standing rule that the UI is a pure projection of
// server truth — it shows what the server says, or it says nothing.
//
// The showcase dataset is still worth having for reviews and screenshots, so it
// survives behind an explicit `?demo=1`, the same opt-in the cinematic table
// already uses. Without that flag, a failed call renders an honest error and an
// empty result renders an honest empty state.

import { useEffect, useState } from "react";

/** True when the URL explicitly asks for the showcase dataset (`?demo=1`). */
export function demoRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

/**
 * Hook form. Starts false so the server render and the first client render
 * agree (no hydration mismatch), then resolves from the URL on mount.
 */
export function useDemoMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(demoRequested()), []);
  return on;
}

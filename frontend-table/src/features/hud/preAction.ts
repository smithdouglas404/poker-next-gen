"use client";

import { useEffect, useState } from "react";

// Pre-action toggles: queue your move before it's your turn (the standard
// multi-table speed feature). When the turn arrives, the queued action fires
// automatically if still legal, then clears. Purely client-side over the
// existing server-authoritative action flow.

export type PreAction = "none" | "check_fold" | "call_any" | "fold";

const listeners = new Set<(p: PreAction) => void>();
let current: PreAction = "none";

export function getPreAction(): PreAction {
  return current;
}

export function setPreAction(p: PreAction): void {
  current = p;
  listeners.forEach((fn) => fn(p));
}

/** Toggle a pre-action (selecting the active one clears it). */
export function togglePreAction(p: PreAction): void {
  setPreAction(current === p ? "none" : p);
}

export function usePreAction(): [PreAction, (p: PreAction) => void] {
  const [p, setP] = useState<PreAction>(current);
  useEffect(() => {
    setP(current);
    const fn = (v: PreAction) => setP(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [p, setPreAction];
}

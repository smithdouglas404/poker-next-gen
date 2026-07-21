"use client";

import { useEffect, useState } from "react";

// Stack display unit: raw chips (cents) or Big Blinds. Pros overwhelmingly want
// BB — it makes stack depth readable at a glance across stakes. Persisted.

export type StackUnit = "chips" | "bb";
const KEY = "poker.stack.unit";
const listeners = new Set<(u: StackUnit) => void>();
let current: StackUnit | null = null;

function read(): StackUnit {
  if (current) return current;
  let v: StackUnit = "chips";
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "bb") v = "bb";
  } catch {
    /* ignore */
  }
  current = v;
  return v;
}

export function getStackUnit(): StackUnit {
  return read();
}

export function setStackUnit(u: StackUnit): void {
  current = u;
  try {
    window.localStorage.setItem(KEY, u);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(u));
}

export function useStackUnit(): [StackUnit, (u: StackUnit) => void] {
  const [unit, setUnit] = useState<StackUnit>(read());
  useEffect(() => {
    setUnit(read());
    const fn = (u: StackUnit) => setUnit(u);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [unit, setStackUnit];
}

/** Format a cents stack either as chips or as "12.5 bb", given the big blind. */
export function formatStack(cents: number, bigBlindCents: number, unit: StackUnit, formatCents: (c: number) => string): string {
  if (unit === "bb" && bigBlindCents > 0) {
    const bb = cents / bigBlindCents;
    return `${bb.toFixed(bb >= 10 ? 0 : 1)} bb`;
  }
  return formatCents(cents);
}

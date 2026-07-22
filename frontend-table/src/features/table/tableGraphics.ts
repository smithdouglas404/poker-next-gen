"use client";

import { useEffect, useState } from "react";

// Table graphics preset:
//   "cinematic" — the R3F cinematic scene (default)
//   "classic"   — the Pixi.js table renderer (fallback)
// Persisted per-device.

export type TableGraphics = "cinematic" | "classic";
const KEY = "tableGraphics";
const listeners = new Set<(g: TableGraphics) => void>();
let current: TableGraphics | null = null;

function read(): TableGraphics {
  if (current) return current;
  let v: TableGraphics = "cinematic";
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "cinematic" || stored === "classic") v = stored;
    }
  } catch {
    /* ignore */
  }
  current = v;
  return v;
}

export function getTableGraphics(): TableGraphics {
  return read();
}

export function setTableGraphics(g: TableGraphics): void {
  current = g;
  try {
    window.localStorage.setItem(KEY, g);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(g));
}

export function useTableGraphics(): [TableGraphics, (g: TableGraphics) => void] {
  const [graphics, setGraphics] = useState<TableGraphics>(read());
  useEffect(() => {
    setGraphics(read());
    const fn = (g: TableGraphics) => setGraphics(g);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [graphics, setTableGraphics];
}

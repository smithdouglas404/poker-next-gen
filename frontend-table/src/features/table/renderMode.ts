"use client";

import { useEffect, useState } from "react";

// Table character render mode:
//   "2d"  — 2.5D CSS/HRC portraits (default)
//   "3d"  — rigged GLB (Tripo pipeline)
//   "mix" — 3D GLB for seats that own a model, 2.5D portraits for the rest
// Persisted per-device; all three are first-class (3D is the premium upgrade,
// mix is the mixed Tripo + portrait table).

export type RenderMode = "2d" | "3d" | "mix";
const KEY = "poker.render.mode";
const listeners = new Set<(m: RenderMode) => void>();
let current: RenderMode | null = null;

function read(): RenderMode {
  if (current) return current;
  let v: RenderMode = "2d";
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "2d" || stored === "3d" || stored === "mix") v = stored;
    }
  } catch {
    /* ignore */
  }
  current = v;
  return v;
}

export function getRenderMode(): RenderMode {
  return read();
}

export function setRenderMode(m: RenderMode): void {
  current = m;
  try {
    window.localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(m));
}

export function useRenderMode(): [RenderMode, (m: RenderMode) => void] {
  const [mode, setMode] = useState<RenderMode>(read());
  useEffect(() => {
    setMode(read());
    const fn = (m: RenderMode) => setMode(m);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [mode, setRenderMode];
}

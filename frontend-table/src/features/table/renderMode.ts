"use client";

import { useEffect, useState } from "react";

// Table character render mode: "2d" (2.5D CSS portraits) or "3d" (rigged GLB).
// Persisted per-device; both are first-class (3D is the premium upgrade).

export type RenderMode = "2d" | "3d";
const KEY = "poker.render.mode";
const listeners = new Set<(m: RenderMode) => void>();
let current: RenderMode | null = null;

function read(): RenderMode {
  if (current) return current;
  let v: RenderMode = "2d";
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "3d") v = "3d";
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

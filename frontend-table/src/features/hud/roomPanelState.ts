"use client";

import { useEffect, useState } from "react";

// Shared, per-device open/closed state for the felt's "Room Control" drawer
// (RoomPanel.tsx). SeatHud needs the same value RoomPanel writes so it can
// shift the seat ring clear of the drawer while it's open — same
// module-cache + listener-Set pattern as tableGraphics.ts/renderMode.ts.
// RoomPanel's drawer is `w-72` (Tailwind) = 18rem = 288px at the default root
// font size. Exported so SeatHud can reserve the same width when computing
// the seat ring — keep this in sync with RoomPanel.tsx's `w-72` class.
export const ROOM_PANEL_WIDTH_PX = 288;

const KEY = "pkr:roomPanelOpen";
const listeners = new Set<(open: boolean) => void>();
let current: boolean | null = null;

function read(defaultValue: boolean): boolean {
  if (current !== null) return current;
  let v = defaultValue;
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(KEY);
      if (stored !== null) v = stored === "1";
    }
  } catch {
    /* ignore */
  }
  current = v;
  return v;
}

export function setRoomPanelOpen(open: boolean): void {
  current = open;
  try {
    window.localStorage.setItem(KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(open));
}

/** `defaultValue` only matters on first read this session (before anything
 *  has been stored) — RoomPanel seeds it from the cinematic/classic default. */
export function useRoomPanelOpen(defaultValue: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => read(defaultValue));
  useEffect(() => {
    setOpen(read(defaultValue));
    const fn = (v: boolean) => setOpen(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [open, setRoomPanelOpen];
}

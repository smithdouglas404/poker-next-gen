"use client";

import { useEffect, useState } from "react";

// Four-color deck: a serious-poker staple. Two-color (♠♣ black, ♥♦ red) is the
// casino default; four-color makes clubs green and diamonds blue so suits are
// never misread in fast multi-table play. Persisted per-device.

export type DeckStyle = "two-color" | "four-color";
const KEY = "poker.deck.style";
const listeners = new Set<(s: DeckStyle) => void>();
let current: DeckStyle | null = null;

function read(): DeckStyle {
  if (current) return current;
  let v: DeckStyle = "two-color";
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "four-color") {
      v = "four-color";
    }
  } catch {
    /* ignore */
  }
  current = v;
  return v;
}

export function getDeckStyle(): DeckStyle {
  return read();
}

export function setDeckStyle(s: DeckStyle): void {
  current = s;
  try {
    window.localStorage.setItem(KEY, s);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(s));
}

/** Suit → fill color for the current deck style. */
export function suitColor(suit: string, style: DeckStyle = read()): number {
  if (style === "four-color") {
    switch (suit) {
      case "s":
        return 0x111827; // spades — black
      case "h":
        return 0xdc2626; // hearts — red
      case "d":
        return 0x2563eb; // diamonds — blue
      case "c":
        return 0x16a34a; // clubs — green
    }
  }
  return suit === "h" || suit === "d" ? 0xdc2626 : 0x111827;
}

export function useDeckStyle(): [DeckStyle, (s: DeckStyle) => void] {
  const [style, setStyle] = useState<DeckStyle>(read());
  useEffect(() => {
    setStyle(read());
    const fn = (s: DeckStyle) => setStyle(s);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [style, setDeckStyle];
}

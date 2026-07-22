"use client";

import { useEffect, useRef, useState } from "react";

/**
 * RAF-driven count-up. Animates from the previous value to the next whenever
 * `value` changes. Respects prefers-reduced-motion (snaps instantly).
 */
export function NumberTicker({
  value,
  className,
  format,
  durationMs = 900,
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  const rounded = Math.round(display);
  return <span className={className}>{format ? format(rounded) : rounded.toLocaleString()}</span>;
}

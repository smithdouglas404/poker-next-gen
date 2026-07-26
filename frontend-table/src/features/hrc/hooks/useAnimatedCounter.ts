import { useState, useEffect, useRef } from "react";

/**
 * Smoothly animates a number from its previous value to a new target.
 * Returns the current display value (always an integer) and whether
 * it is currently animating.
 */
export function useAnimatedCounter(
  target: number,
  duration: number = 400,
): { value: number; animating: boolean; delta: number } {
  const [display, setDisplay] = useState(target);
  const [animating, setAnimating] = useState(false);
  const [delta, setDelta] = useState(0);
  const rafRef = useRef<number>(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    const from = prevTarget.current;
    const to = target;
    prevTarget.current = target;

    if (from === to) return;

    setDelta(to - from);
    setAnimating(true);

    const startTime = performance.now();
    const diff = to - from;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * eased);
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        setAnimating(false);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return { value: display, animating, delta };
}

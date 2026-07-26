// Shared motion vocabulary. Import these instead of writing raw animation values per
// file, so the whole app moves with one personality.
//
// WHY SPRINGS, NOT EASING CURVES: a CSS `ease-in-out` transition moves at a rate nothing
// physical ever moves at, which is what makes a UI read as "a web page". A spring carries
// stiffness, damping and mass, so elements arrive with weight and momentum and the eye
// reads them as objects. That difference is most of what separates a screen that feels
// premium from one that feels static.
//
// Only `transform` and `opacity` are animated in these presets. Both are composited on
// the GPU, so they do not trigger layout or paint — the same reason this approach costs a
// fraction of a WebGL canvas while delivering most of the perceived depth.

import type { Transition, Variants } from "framer-motion";

export const SPRINGS = {
  /** Buttons, toggles, taps — resolves fast with no visible wobble. */
  snappy: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  /** Rewards, unlocks, celebratory reveals — deliberate overshoot. */
  bouncy: { type: "spring", stiffness: 300, damping: 15 } as Transition,
  /** Panels, page sections, layout shifts — slow and heavy. */
  smooth: { type: "spring", stiffness: 100, damping: 20 } as Transition,
} as const;

/** Section fade-and-rise on mount. */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: SPRINGS.smooth },
};

/** Parent of a list/grid: children enter in sequence rather than all at once. */
export const STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Child of a STAGGER parent. */
export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRINGS.smooth },
};

/** Card lift on hover + press feedback. Spread onto a motion element. */
export const LIFT = {
  whileHover: { y: -6, scale: 1.02, transition: SPRINGS.snappy },
  whileTap: { scale: 0.98, transition: SPRINGS.snappy },
} as const;

/** Modal/drawer enter+exit, for use inside <AnimatePresence>. */
export const POP: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: SPRINGS.snappy },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.12 } },
};

/**
 * Container that gives children real depth for rotateX/rotateY tilts and card flips.
 * `perspective` alone does nothing without `preserve-3d` on the transformed child.
 */
export const PERSPECTIVE = { perspective: 1000, transformStyle: "preserve-3d" } as const;

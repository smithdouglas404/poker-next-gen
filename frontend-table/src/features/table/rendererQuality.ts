/**
 * Canvas resolution for Pixi.js.
 *
 * Embedded previews (Replit, CodeSandbox, etc.) often run inside an iframe
 * that reports devicePixelRatio = 1 even on retina displays, which makes
 * the table look soft compared to a full local browser tab.
 */
export function getCanvasResolution(): number {
  const dpr = window.devicePixelRatio || 1;
  const inEmbeddedPreview = window.self !== window.top;

  if (inEmbeddedPreview) {
    // Replit/CodeSandbox iframes often report DPR 1 — render at 2x minimum.
    return Math.min(Math.max(dpr, 2.5), 3);
  }

  // Cap native DPR to keep performance reasonable on 3x mobile screens.
  return Math.min(dpr, 2.5);
}

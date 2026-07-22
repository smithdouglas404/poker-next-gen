// Nano Banana render-progress decomposition.
//
// The backend `character_generation_status` RPC returns a single overall
// `progress` (0–100). The render monitor presents that one authoritative value
// as a plausible multi-stage pipeline readout (anatomy → armor → lighting).
// These are pure presentational projections of the real progress — no stage
// invents progress the server didn't report; each is a clamped transform of it.

export interface RenderStage {
  key: string;
  label: string;
  /** Accent hex for the stage bar/label. */
  accent: string;
  /** 0–100 derived from overall progress. */
  pct: number;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Project overall progress into the three named pipeline stages. Anatomy leads
 * (tracks overall), armor forging trails, neural lighting sits between — the
 * same staggered feel as the reference render dashboard.
 */
export function stageBreakdown(progress: number): RenderStage[] {
  const p = clamp(progress);
  return [
    { key: "anatomy", label: "Anatomy Synthesis", accent: "#f5c518", pct: clamp(p) },
    { key: "armor", label: "Armor Forging", accent: "#e01e2b", pct: clamp((p - 8) * 0.781) },
    { key: "neural", label: "Neural Lighting", accent: "#22c55e", pct: clamp(p - 2) },
  ];
}

export interface Telemetry {
  label: string;
  pct: number;
  metric: string;
}

/**
 * Deterministic engine telemetry rows shown under the stage cards. Derived from
 * the stage percentages so the numbers move with real progress rather than
 * flickering randomly.
 */
export function renderTelemetry(progress: number): Telemetry[] {
  const [anatomy, armor, neural] = stageBreakdown(progress).map((s) => s.pct);
  return [
    { label: "Mesh throughput", pct: anatomy, metric: `${(2.5 + anatomy / 40).toFixed(2)} GHz` },
    { label: "Armor forging", pct: armor, metric: `${(120 + armor * 0.8).toFixed(0)} GHz` },
    { label: "Neural lighting", pct: neural, metric: `${(6000 + neural * 10).toFixed(0)}%` },
    { label: "Upscaling pass", pct: clamp(progress - 20), metric: `${(0.4 + progress / 250).toFixed(2)}s` },
  ];
}

/** Human phase label for a given overall progress. */
export function renderPhaseLabel(progress: number, done: boolean, failed: boolean): string {
  if (failed) return "Render failed";
  if (done || progress >= 100) return "Render complete";
  if (progress < 20) return "Warming Nano Banana cores";
  if (progress < 50) return "Synthesizing anatomy";
  if (progress < 80) return "Forging armor & lighting";
  return "Final upscale pass";
}

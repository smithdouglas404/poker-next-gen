// Character-generation progress, from the real pipeline.
//
// This file used to invent its own three stages — "Anatomy Synthesis", "Armor
// Forging", "Neural Lighting" — none of which are steps the generator performs,
// each derived from the single overall percentage by arbitrary arithmetic
// (`(p - 8) * 0.781`). It also emitted "engine telemetry": mesh throughput in
// GHz, armor forging in GHz, neural lighting at "6000%". Those were not
// measurements of anything; they were numbers shaped like measurements.
//
// The generator actually runs three Tripo tasks, and the server stores which one
// a job is on (poker_generation.stage) and now reports it:
//
//   model     text → base mesh          (the long one)
//   rig       auto-rig so it can animate
//   retarget  attach the idle animation
//
// A stage is therefore in one of three real states — done, running, or waiting —
// and that is all this reports.

export type StageState = "done" | "running" | "waiting";

export interface RenderStage {
  key: string;
  label: string;
  blurb: string;
  accent: string;
  state: StageState;
  /** 0–100 within this stage, derived from the server's overall progress. */
  pct: number;
}

/** The pipeline, in order, with the overall-progress band each stage occupies.
 *  The bands match rpc/character.go `overallProgress`. */
const PIPELINE: {
  key: string;
  label: string;
  blurb: string;
  accent: string;
  from: number;
  to: number;
}[] = [
  {
    key: "model",
    label: "Building the model",
    blurb: "Turning your description into a 3D mesh",
    accent: "#f5c518",
    from: 0,
    to: 60,
  },
  {
    key: "rig",
    label: "Rigging",
    blurb: "Adding a skeleton so the character can move",
    accent: "#e01e2b",
    from: 60,
    to: 80,
  },
  {
    key: "retarget",
    label: "Adding animation",
    blurb: "Attaching the idle animation used at the table",
    accent: "#22c55e",
    from: 80,
    to: 100,
  },
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Break the server's overall progress into the real stages.
 *
 * `stage` is the authoritative current step when the server sends one; progress
 * alone is used as a fallback so an older response still renders sensibly.
 */
export function stageBreakdown(progress: number, stage?: string): RenderStage[] {
  const p = clamp(progress);
  const currentIndex = stage ? PIPELINE.findIndex((s) => s.key === stage) : -1;

  return PIPELINE.map((s, i) => {
    // Position within this stage's band of the overall bar.
    const span = s.to - s.from;
    const pct = clamp(((p - s.from) / span) * 100);

    let state: StageState;
    if (currentIndex >= 0) {
      state = i < currentIndex ? "done" : i === currentIndex ? "running" : "waiting";
    } else {
      state = p >= s.to ? "done" : p > s.from ? "running" : "waiting";
    }
    // A finished job has every stage done, whatever the last reported stage was.
    if (p >= 100) state = "done";

    return {
      key: s.key,
      label: s.label,
      blurb: s.blurb,
      accent: s.accent,
      state,
      // A stage that has not started shows 0, not a fraction of someone else's
      // progress; a finished one shows 100.
      pct: state === "done" ? 100 : state === "waiting" ? 0 : pct,
    };
  });
}

/** Plain-language phase label for the current stage. */
export function renderPhaseLabel(
  progress: number,
  done: boolean,
  failed: boolean,
  stage?: string,
): string {
  if (failed) return "Generation failed";
  if (done || clamp(progress) >= 100) return "Character ready";
  const current = stageBreakdown(progress, stage).find((s) => s.state === "running");
  return current ? current.label : "Starting up";
}

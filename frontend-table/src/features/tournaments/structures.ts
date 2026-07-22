// Deterministic blind & payout structure generators. The create wizard collects
// a compact draft (number of levels, interval, payout preset); on publish we
// expand that into concrete rows and persist each via blind_level_add /
// prize_pool_add. Keeping the expansion here means the summary sidebar and the
// persistence path agree on exactly what a draft produces.

import type { BlindLevel, DraftForm, Prize } from "./types";

/** A standard escalating blind ladder derived from starting stack + level count.
 *  A break is inserted after every 4 played levels (mirrors the demo ladder). */
export function buildBlindLevels(draft: DraftForm): BlindLevel[] {
  const levels: BlindLevel[] = [];
  const duration = Math.max(60, draft.levelMinutes * 60);
  // Anchor the opening big blind to ~1/100th of the starting stack, rounded.
  const baseBB = Math.max(100, Math.round((draft.startingStack / 100) / 100) * 100);
  let bb = baseBB;
  let played = 0;
  for (let i = 1; i <= Math.max(1, draft.numLevels); i++) {
    const sb = Math.round(bb / 2);
    levels.push({
      level: i,
      small_blind: sb,
      big_blind: bb,
      ante: Math.round(bb / 8 / 10) * 10,
      duration_secs: duration,
    });
    played++;
    if (played % 4 === 0 && i < draft.numLevels) {
      levels.push({ level: 0, small_blind: 0, big_blind: 0, ante: 0, duration_secs: 300, is_break: true });
    }
    // Geometric escalation ~1.5×, snapped to a clean increment.
    bb = Math.round((bb * 1.5) / 100) * 100;
  }
  return levels;
}

/** Payout ladders (basis points) for each preset the wizard exposes. */
const PRESET_BPS: Record<string, number[]> = {
  wta: [10000],
  final: [3000, 2000, 1400, 1000, 700, 500, 400, 350, 250],
  top10: [3500, 2200, 1400, 900, 600, 500, 400, 300, 200, 100],
  top15: [3000, 2000, 1300, 900, 700, 600, 500, 400, 300, 200, 100],
  top20: [2500, 1700, 1200, 900, 700, 600, 500, 400, 350, 300, 250, 200, 150, 100, 50],
};

/** Expand a payout preset into concrete tiers, normalised so bps sum to 10000. */
export function buildPrizeTiers(payoutStructure: string): Prize[] {
  const raw = PRESET_BPS[payoutStructure] ?? PRESET_BPS.top15;
  const sum = raw.reduce((s, v) => s + v, 0) || 1;
  let running = 0;
  return raw.map((v, i) => {
    // Normalise to exactly 10000 bps, pushing rounding drift into the last tier.
    let bps = Math.round((v / sum) * 10000);
    running += bps;
    if (i === raw.length - 1) bps += 10000 - running;
    return { rank_from: i + 1, rank_to: i + 1, payout_bps: bps, guaranteed_minor: 0 };
  });
}

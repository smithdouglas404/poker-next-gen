"use client";

// Real-time structure simulator: a blind-curve visualizer + duration estimate
// derived from a level list. Pure presentation — the same level data drives the
// tournament builder's blind_level_add calls.

export interface BlindLevel {
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_secs: number;
}

export function blindPreset(minutes: number): BlindLevel[] {
  const secs = minutes * 60;
  const steps = [
    [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
    [200, 400], [300, 600], [500, 1000], [700, 1400], [1000, 2000],
    [1500, 3000], [2500, 5000],
  ];
  return steps.map(([sb, bb], i) => ({
    level: i + 1,
    small_blind: sb,
    big_blind: bb,
    ante: i >= 3 ? Math.round(bb / 10) : 0,
    duration_secs: secs,
  }));
}

export function BlindCurve({ blinds }: { blinds: BlindLevel[] }) {
  if (blinds.length === 0) return null;
  const totalSecs = blinds.reduce((a, b) => a + (b.duration_secs || 0), 0);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.round((totalSecs % 3600) / 60);
  const durLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const W = 520;
  const H = 120;
  const maxBB = Math.max(1, ...blinds.map((b) => b.big_blind));
  const pt = (i: number, bb: number) => {
    const x = blinds.length === 1 ? 0 : (i / (blinds.length - 1)) * W;
    const y = H - (bb / maxBB) * (H - 10) - 5;
    return [x, y] as const;
  };
  const line = blinds.map((b, i) => pt(i, b.big_blind).map((n) => n.toFixed(1)).join(",")).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Est. duration</p>
          <p className="text-2xl font-bold text-gold">{durLabel}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Levels</p>
          <p className="text-2xl font-bold text-white">{blinds.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted">Top blind</p>
          <p className="text-2xl font-bold text-brand">{maxBB.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">Blind curve</p>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
          <defs>
            <linearGradient id="ccBlindFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff2d3f" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ff2d3f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#ccBlindFill)" />
          <polyline points={line} fill="none" stroke="#ff2d3f" strokeWidth={2} strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

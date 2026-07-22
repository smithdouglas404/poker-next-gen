"use client";

// Dependency-free inline-SVG charts for the Clubs analytics surface.
// All labels/values render in the DOM (SVG <text>) — no chart library.

export function Sparkbars({
  values,
  color = "#81ecff",
  height = 56,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length === 0) {
    return <div className="text-xs text-neutral-600">No data yet.</div>;
  }
  const max = Math.max(...values, 1);
  const gap = 3;
  const w = 100;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-14 w-full">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 4));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={1.2}
            fill={color}
            opacity={0.35 + 0.65 * (v / max)}
          />
        );
      })}
    </svg>
  );
}

export function Donut({
  segments,
  size = 108,
  thickness = 14,
  center,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
      )}
    </div>
  );
}

export function ProgressBar({
  pct,
  color = "#81ecff",
}: {
  pct: number;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}

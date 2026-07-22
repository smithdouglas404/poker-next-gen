"use client";

// Dependency-free inline-SVG charts for the Clubs analytics surface.
// All labels/values render in the DOM (SVG <text>) — no chart library.

export function Sparkbars({
  values,
  color = "#22c55e",
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

export function LineChart({
  values,
  labels,
  color = "#22c55e",
  height = 160,
  fmtY,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
  fmtY?: (n: number) => string;
}) {
  if (values.length === 0) return <div className="text-xs text-neutral-600">No data yet.</div>;
  const w = 320;
  const padL = 34;
  const padB = 18;
  const padT = 8;
  const max = Math.max(...values, 1);
  const innerW = w - padL - 4;
  const innerH = height - padB - padT;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
  const px = (i: number) => padL + i * stepX;
  const py = (v: number) => padT + innerH - (v / max) * innerH;
  const line = values.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const area = `${padL},${padT + innerH} ${line} ${px(values.length - 1)},${padT + innerH}`;
  const gid = `lg-${color.replace("#", "")}`;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => {
        const y = py(t);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - 4} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.4)">
              {fmtY ? fmtY(t) : t}
            </text>
          </g>
        );
      })}
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={2.4} fill={color} />
      ))}
      {labels?.map((l, i) =>
        i % Math.ceil(labels.length / 6) === 0 ? (
          <text key={i} x={px(i)} y={height - 4} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)">
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function ColumnChart({
  values,
  labels,
  color = "#22c55e",
  height = 160,
  fmtY,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
  fmtY?: (n: number) => string;
}) {
  if (values.length === 0) return <div className="text-xs text-neutral-600">No data yet.</div>;
  const w = 320;
  const padL = 34;
  const padB = 18;
  const padT = 8;
  const max = Math.max(...values, 1);
  const innerW = w - padL - 4;
  const innerH = height - padB - padT;
  const gap = 4;
  const bw = (innerW - gap * (values.length - 1)) / values.length;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      {ticks.map((t, i) => {
        const y = padT + innerH - (t / max) * innerH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - 4} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.4)">
              {fmtY ? fmtY(t) : t}
            </text>
          </g>
        );
      })}
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * innerH);
        const x = padL + i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={padT + innerH - h} width={bw} height={h} rx={1.5} fill={color} opacity={0.45 + 0.55 * (v / max)} />
            {labels?.[i] && (
              <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)">
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressBar({
  pct,
  color = "#22c55e",
}: {
  pct: number;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped * 100}%`, background: color }}
      />
    </div>
  );
}

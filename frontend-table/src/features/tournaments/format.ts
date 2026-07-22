// Formatting helpers for the tournaments surface. All money is minor units
// (cents) on the wire; the lobby renders compact ($150k, $1.2M) figures.

export function dollars(minor: number, opts?: { compact?: boolean }): string {
  const v = minor / 100;
  if (opts?.compact) return `$${compact(v)}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** 1500 → 1.5k, 1_200_000 → 1.2M. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

function trim(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

/** Chip counts on the leaderboard: 412500 → 412.5k. */
export function chips(n: number): string {
  return compact(n);
}

/** Seconds → M:SS clock. */
export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Milliseconds-until → "02:14:45" (H:MM:SS) or "42m" style short form. */
export function countdown(ms: number, opts?: { short?: boolean }): string {
  if (ms <= 0) return opts?.short ? "Live" : "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (opts?.short) {
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

/** Human "Starts in 12m" / "Late reg" / "Ongoing". */
export function startsLabel(scheduledAt: string, status: string): string {
  if (status === "running") return "Ongoing";
  if (status === "finished") return "Completed";
  const t = Date.parse(scheduledAt);
  if (Number.isNaN(t)) return "TBD";
  const ms = t - Date.now();
  if (ms <= 0) return "Starting";
  return `Starts in ${countdown(ms, { short: true })}`;
}

export function msUntil(scheduledAt: string): number {
  const t = Date.parse(scheduledAt);
  if (Number.isNaN(t)) return 0;
  return t - Date.now();
}

/** Blinds "1,500 / 3,000". */
export function blinds(sb: number, bb: number): string {
  return `${sb.toLocaleString()} / ${bb.toLocaleString()}`;
}

/** Basis points → "12.5%". */
export function bps(v: number): string {
  return `${(v / 100).toFixed(v % 100 === 0 ? 0 : 1)}%`;
}

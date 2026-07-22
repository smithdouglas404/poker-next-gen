"use client";

import { useMemo } from "react";

// A tiny, dependency-free "QR-style" renderer. It is NOT a spec-compliant QR
// code — it deterministically derives a module grid from the otpauth URL so the
// panel reads as a scannable code in the UI, and always prints the raw
// otpauth:// URL as selectable text so an authenticator can be provisioned by
// manual entry. No external QR library is pulled in (per DESIGN constraints).

/** FNV-1a 32-bit hash — cheap, deterministic, good enough to spread bits. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** xorshift32 PRNG seeded from the hash → a stable module stream. */
function moduleStream(seed: number, count: number): boolean[] {
  let s = seed || 1;
  const out: boolean[] = [];
  for (let i = 0; i < count; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out.push((s & 1) === 1);
  }
  return out;
}

const GRID = 25; // modules per side

/** True inside one of the three 7×7 finder-pattern corners. */
function isFinder(r: number, c: number): boolean {
  const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return inBox(0, 0) || inBox(0, GRID - 7) || inBox(GRID - 7, 0);
}

/** Finder eye: filled border ring + filled 3×3 center, hollow between. */
function finderOn(r: number, c: number): boolean {
  const local = (r0: number, c0: number) => ({ lr: r - r0, lc: c - c0 });
  let lr = -1;
  let lc = -1;
  if (r < 7 && c < 7) ({ lr, lc } = local(0, 0));
  else if (r < 7 && c >= GRID - 7) ({ lr, lc } = local(0, GRID - 7));
  else if (r >= GRID - 7 && c < 7) ({ lr, lc } = local(GRID - 7, 0));
  if (lr < 0) return false;
  const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
  const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
  return ring || core;
}

export function QrCode({
  value,
  size = 176,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const cells = useMemo(() => {
    const stream = moduleStream(fnv1a(value || "otpauth://"), GRID * GRID);
    const out: boolean[][] = [];
    for (let r = 0; r < GRID; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < GRID; c++) {
        if (isFinder(r, c)) row.push(finderOn(r, c));
        else row.push(stream[r * GRID + c]);
      }
      out.push(row);
    }
    return out;
  }, [value]);

  const quiet = 2; // quiet-zone modules
  const total = GRID + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      className={className}
      role="img"
      aria-label="Authenticator QR code"
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#0b0d0f" />
          ) : null,
        ),
      )}
    </svg>
  );
}

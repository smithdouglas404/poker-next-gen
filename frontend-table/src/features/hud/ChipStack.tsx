"use client";

// Chip-denomination stack: break a seat's stack (in cents) into standard casino
// chip denominations and render them as colored discs — the at-a-glance "how
// deep is that player" read you get at a real table.

interface Denom {
  /** value in cents */
  value: number;
  color: string;
  ring: string;
}

// Largest → smallest. Colors follow standard casino conventions.
const DENOMS: Denom[] = [
  { value: 500000, color: "#f97316", ring: "#fdba74" }, // $5,000 — orange
  { value: 100000, color: "#d4af37", ring: "#f3e2ad" }, // $1,000 — gold
  { value: 50000, color: "#a855f7", ring: "#d8b4fe" }, //  $500  — purple
  { value: 10000, color: "#1f2937", ring: "#6b7280" }, //  $100  — black
  { value: 2500, color: "#16a34a", ring: "#4ade80" }, //   $25   — green
  { value: 500, color: "#dc2626", ring: "#f87171" }, //    $5    — red
  { value: 100, color: "#e5e7eb", ring: "#ffffff" }, //    $1    — white
];

interface DenomCount {
  denom: Denom;
  count: number;
}

/** Greedy denomination breakdown of a cents amount (largest chips first). */
export function chipBreakdown(cents: number): DenomCount[] {
  let remaining = Math.max(0, Math.floor(cents));
  const out: DenomCount[] = [];
  for (const denom of DENOMS) {
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      out.push({ denom, count });
      remaining -= count * denom.value;
    }
  }
  return out;
}

function ChipColumn({ dc, maxDiscs }: { dc: DenomCount; maxDiscs: number }) {
  const discs = Math.min(dc.count, maxDiscs);
  return (
    <div className="relative flex flex-col items-center" title={`$${dc.denom.value / 100} × ${dc.count}`}>
      <div className="relative" style={{ width: 12, height: 6 + discs * 2.5 }}>
        {Array.from({ length: discs }).map((_, i) => (
          <span
            key={i}
            className="absolute left-0 h-[9px] w-3 rounded-full"
            style={{
              bottom: i * 2.5,
              backgroundColor: dc.denom.color,
              boxShadow: `inset 0 0 0 1px ${dc.denom.ring}, 0 1px 1px rgba(0,0,0,0.5)`,
            }}
          />
        ))}
      </div>
      {dc.count > maxDiscs && (
        <span className="mt-0.5 text-[8px] font-bold leading-none text-neutral-400">×{dc.count}</span>
      )}
    </div>
  );
}

/** Compact chip-denomination stack for a seat plaque. */
export function ChipStack({ cents, maxColumns = 5 }: { cents: number; maxColumns?: number }) {
  const breakdown = chipBreakdown(cents).slice(0, maxColumns);
  if (breakdown.length === 0) return null;
  return (
    <div className="mt-1 flex items-end justify-center gap-[3px]">
      {breakdown.map((dc) => (
        <ChipColumn key={dc.denom.value} dc={dc} maxDiscs={5} />
      ))}
    </div>
  );
}

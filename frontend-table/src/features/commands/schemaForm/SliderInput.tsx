"use client";

// A labelled range slider for bounded numeric inputs (simulation runs, seats
// per table, rake %). Novice-friendly: drag between a known min and max with a
// live readout, instead of guessing a number in a blank box. The readout formats
// per unit — "5.00%" for basis points, "6 seats", "2,000 runs".

function fmt(value: number, unit: string | undefined): string {
  if (unit === "bps") return `${(value / 100).toFixed(2)}%`;
  if (unit === "percent") return `${value}%`;
  if (unit === "seconds") return value >= 60 ? `${+(value / 60).toFixed(value % 60 ? 1 : 0)} min` : `${value}s`;
  return value.toLocaleString("en-US");
}

export function SliderInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  suffix,
  invalid,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  suffix?: string;
  invalid?: boolean;
}) {
  const v = Number.isFinite(value) ? value : min;
  return (
    <div className={invalid ? "rounded-xl ring-1 ring-brand/50" : ""}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-lg font-semibold text-gold">{fmt(v, unit)}</span>
        {suffix && <span className="text-xs text-neutral-400">{suffix}</span>}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-gold"
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{fmt(min, unit)}</span>
        <span>{fmt(max, unit)}</span>
      </div>
    </div>
  );
}

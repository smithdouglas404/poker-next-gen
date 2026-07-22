"use client";

import { useEffect, useState } from "react";

import { bpsToPercentNumber, percentToBps } from "./format";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

/**
 * BasisPointsInput (UI review P0-2): the operator types a percent ("5"), the
 * component emits basis points (500) to the RPC. Used for rake and equity so an
 * operator never sees or types a raw bps integer.
 */
export function BasisPointsInput({
  value,
  onChange,
  id,
  min,
  max,
  invalid,
  suffixHint,
}: {
  value: number; // basis points
  onChange: (bps: number) => void;
  id?: string;
  min?: number; // bps
  max?: number; // bps
  invalid?: boolean;
  suffixHint?: string; // e.g. "rake" or "equity"
}) {
  const [text, setText] = useState<string>(() => (value ? String(bpsToPercentNumber(value)) : ""));

  useEffect(() => {
    const asBps = percentToBps(text);
    if (asBps !== value) {
      setText(value ? String(bpsToPercentNumber(value)) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const belowMin = min != null && value < min;
  const aboveMax = max != null && value > max;

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="0"
          aria-invalid={invalid || belowMin || aboveMax}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const bps = percentToBps(next);
            onChange(bps ?? 0);
          }}
          className={`${FIELD} pr-8 ${
            invalid || belowMin || aboveMax ? "border-brand/60 focus:border-brand" : ""
          }`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold">
          %
        </span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">
        <span className="font-semibold text-gold">{bpsToPercentNumber(value || 0)}%</span>
        {suffixHint ? ` ${suffixHint}` : ""}
        {aboveMax && <span className="text-brand"> · max {bpsToPercentNumber(max!)}%</span>}
        {belowMin && <span className="text-brand"> · min {bpsToPercentNumber(min!)}%</span>}
      </p>
    </div>
  );
}

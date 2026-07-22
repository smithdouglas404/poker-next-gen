"use client";

import { useEffect, useState } from "react";

import { currencySymbol, decimalStringToMinor, minorToDecimalString } from "./format";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

/**
 * MoneyInput (UI review P0-2): the operator types dollars, the component emits
 * minor units (cents) to the RPC. A live echo confirms the exact amount so a
 * mistyped digit is obvious before submit. No screen ever shows a raw
 * minor-unit integer.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  id,
  min,
  max,
  invalid,
}: {
  value: number; // minor units
  onChange: (minor: number) => void;
  currency?: string;
  id?: string;
  min?: number;
  max?: number;
  invalid?: boolean;
}) {
  const [text, setText] = useState<string>(() => (value ? minorToDecimalString(value) : ""));

  // Keep the box in sync when the value is changed from outside (e.g. example prefill).
  useEffect(() => {
    const asMinor = decimalStringToMinor(text);
    if (asMinor !== value) {
      setText(value ? minorToDecimalString(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const sym = currencySymbol(currency);
  const belowMin = min != null && value < min;
  const aboveMax = max != null && value > max;

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold">
          {sym}
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="0.00"
          aria-invalid={invalid || belowMin || aboveMax}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const minor = decimalStringToMinor(next);
            onChange(minor ?? 0);
          }}
          onBlur={() => {
            const minor = decimalStringToMinor(text);
            setText(minor ? minorToDecimalString(minor) : "");
          }}
          className={`${FIELD} pl-7 ${
            invalid || belowMin || aboveMax ? "border-brand/60 focus:border-brand" : ""
          }`}
        />
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">
        Entering{" "}
        <span className="font-semibold text-gold">
          {sym}
          {minorToDecimalString(value || 0)}
        </span>
        {belowMin && <span className="text-red-400"> · minimum {sym}{minorToDecimalString(min!)}</span>}
        {aboveMax && <span className="text-red-400"> · maximum {sym}{minorToDecimalString(max!)}</span>}
      </p>
    </div>
  );
}

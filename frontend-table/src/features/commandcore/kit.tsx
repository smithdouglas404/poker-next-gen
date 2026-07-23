"use client";

import type { ReactNode } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Shared neon-glassmorphism building blocks for the NEXUS OS surfaces (Command
// Core pre-game + Live Cyber-Deck in-game). Dark, high-contrast, cyan/gold.

export function NeonSection({
  index,
  title,
  right,
  children,
  className,
}: {
  index?: string;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(GLASS_PANEL, "border-white/10 p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {index && (
            <span className="rounded-md border border-cyan/30 bg-cyan/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-cyan">
              {index}
            </span>
          )}
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// PreviewTile — a clearly-labeled, non-interactive placeholder for a capability
// that isn't wired yet. Deliberately disabled so it never reads as a live
// control (DESIGN-SYSTEM: no dead buttons).
export function PreviewTile({ title, caption }: { title: string; caption: string }) {
  return (
    <div
      aria-disabled
      className="pointer-events-none select-none rounded-xl border border-dashed border-purple-400/30 bg-purple-500/[0.04] p-4 opacity-70"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">
          Preview
        </span>
        <p className="text-sm font-semibold text-neutral-200">{title}</p>
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">{caption}</p>
    </div>
  );
}

// NeonToggle — a real on/off control (bind to state). For disabled/preview use
// PreviewTile instead.
export function NeonToggle({
  on,
  onToggle,
  label,
  sub,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  sub?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50",
        on ? "border-cyan/40 bg-cyan/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20",
      )}
    >
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {sub && <span className="mt-0.5 block text-[11px] text-neutral-400">{sub}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition",
          on ? "bg-cyan/70" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            on ? "left-4" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

// NeonSlider — labeled range with a live value read-out.
export function NeonSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="text-sm font-bold text-cyan">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan"
      />
    </div>
  );
}

// Chip — a small pill for accepted-currency / status markers.
export function Chip({ label, on = true }: { label: string; on?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        on ? "border-green/40 bg-green/[0.08] text-green" : "border-white/10 text-neutral-500",
      )}
    >
      {label}
    </span>
  );
}

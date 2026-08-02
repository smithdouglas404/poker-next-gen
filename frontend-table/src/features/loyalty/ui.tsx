"use client";
// ── Loyalty UI primitives v2 — Premium dark-casino design system ─────────────
// Eyebrow, GoldHeading, GlassCard, StatTile, ProgressBar, Pill, EmptyState
import type { ReactNode } from "react";
import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

/** Uppercase, wide-tracked section eyebrow. */
export function Eyebrow({
  children,
  className,
  tone = "gold",
}: {
  children: ReactNode;
  className?: string;
  tone?: "gold" | "green" | "muted";
}) {
  const color =
    tone === "gold"  ? "text-[#f5c518]/80" :
    tone === "green" ? "text-[#22c55e]/80" :
    "text-neutral-400";
  return (
    <p className={cn("font-display text-[11px] font-bold uppercase tracking-[0.30em]", color, className)}>
      {children}
    </p>
  );
}

/** Gold-gradient display heading. */
export function GoldHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "font-display font-bold uppercase tracking-wide",
        "bg-gradient-to-b from-[#ffe9a8] via-[#f5c518] to-[#c99700] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Card wrapper with standard surface border + optional hover glow. */
export function GlassCard({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={cn(GLASS_PANEL, hover && GLASS_PANEL_HOVER, className)}>{children}</div>;
}

/** Compact labelled stat tile with accent glow. */
export function StatTile({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: ReactNode;
  accent?: "default" | "gold" | "green";
}) {
  const valueColor =
    accent === "gold"  ? "text-[#f5c518]" :
    accent === "green" ? "text-[#22c55e]" :
    "text-white";

  const borderColor =
    accent === "gold"  ? "rgba(245,197,24,0.20)" :
    accent === "green" ? "rgba(34,197,94,0.20)"  :
    "rgba(255,255,255,0.08)";

  const bgColor =
    accent === "gold"  ? "rgba(245,197,24,0.05)" :
    accent === "green" ? "rgba(34,197,94,0.05)"  :
    "rgba(0,0,0,0.25)";

  return (
    <div
      className="relative overflow-hidden rounded-xl px-3 py-3 text-center transition hover:-translate-y-0.5"
      style={{ border: `1px solid ${borderColor}`, background: bgColor }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${borderColor === "rgba(255,255,255,0.08)" ? "rgba(255,255,255,0.15)" : borderColor.replace("0.20","0.50")},transparent)` }}
      />
      <p className={cn("font-display text-lg font-bold tabular-nums leading-none", valueColor)}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</p>
    </div>
  );
}

/** Themeable progress bar with soft gradient fill and glow. */
export function ProgressBar({
  value,
  tone = "gold",
  className,
}: {
  value: number; // 0..1
  tone?: "gold" | "green" | "emerald";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill =
    tone === "green"   ? "from-[#16a34a] to-[#22c55e]" :
    tone === "emerald" ? "from-emerald-600 to-emerald-400" :
    "from-[#c99700] via-[#f5c518] to-[#ffe066]";
  const glow =
    tone === "green"   ? "rgba(34,197,94,0.35)"   :
    tone === "emerald" ? "rgba(52,211,153,0.35)"  :
    "rgba(245,197,24,0.35)";
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700", fill)}
        style={{ width: `${pct}%`, boxShadow: `0 0 8px ${glow}` }}
      />
    </div>
  );
}

/** Small pill badge. */
export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "gold" | "green" | "emerald" | "muted";
  className?: string;
}) {
  const styles: Record<string, string> = {
    gold:    "border-[#f5c518]/40 bg-[#f5c518]/[0.08] text-[#f5c518]",
    green:   "border-[#22c55e]/40 bg-[#22c55e]/[0.08] text-[#22c55e]",
    emerald: "border-emerald-500/40 bg-emerald-950/40 text-emerald-300",
    muted:   "border-white/10 bg-white/[0.04] text-neutral-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Centered empty-state for empty server lists. */
export function EmptyState({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-12 text-center">
      {icon && <span className="text-3xl opacity-50">{icon}</span>}
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

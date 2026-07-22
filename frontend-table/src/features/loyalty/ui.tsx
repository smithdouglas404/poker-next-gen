"use client";

import type { ReactNode } from "react";

import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

/** Uppercase, wide-tracked section eyebrow matching the HUD. */
export function Eyebrow({
  children,
  className,
  tone = "gold",
}: {
  children: ReactNode;
  className?: string;
  tone?: "gold" | "cyan" | "muted";
}) {
  const color =
    tone === "gold" ? "text-gold/80" : tone === "cyan" ? "text-cyan/80" : "text-neutral-400";
  return (
    <p
      className={cn(
        "font-display text-[11px] font-bold uppercase tracking-[0.28em]",
        color,
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Gold-gradient display heading (Space Grotesk, uppercase, wide tracking). */
export function GoldHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "font-display font-bold uppercase tracking-wide",
        "bg-gradient-to-b from-[#f3e2ad] via-[#e7cd7b] to-[#b8912f] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Glass card wrapper with the standard border/blur + optional cyan hover glow. */
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

/** A compact labelled stat tile. */
export function StatTile({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: ReactNode;
  accent?: "default" | "gold" | "cyan";
}) {
  const valueColor =
    accent === "gold" ? "text-gold" : accent === "cyan" ? "text-cyan" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-center">
      <p className={cn("text-lg font-bold tabular-nums", valueColor)}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
        {label}
      </p>
    </div>
  );
}

/** Themeable progress bar with a soft gradient fill. */
export function ProgressBar({
  value,
  tone = "gold",
  className,
}: {
  value: number; // 0..1
  tone?: "gold" | "cyan" | "emerald";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill =
    tone === "cyan"
      ? "from-cyan/70 to-cyan"
      : tone === "emerald"
        ? "from-emerald-500 to-emerald-300"
        : "from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad]";
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700", fill)}
        style={{ width: `${pct}%` }}
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
  tone?: "gold" | "cyan" | "emerald" | "muted";
  className?: string;
}) {
  const styles: Record<string, string> = {
    gold: "border-gold/40 bg-gold/10 text-gold",
    cyan: "border-cyan/40 bg-cyan/10 text-cyan",
    emerald: "border-emerald-500/40 bg-emerald-950/40 text-emerald-300",
    muted: "border-white/10 bg-white/5 text-neutral-400",
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

/** Centered empty-state used when a server list comes back empty. */
export function EmptyState({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-10 text-center">
      {icon && <span className="text-2xl opacity-60">{icon}</span>}
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

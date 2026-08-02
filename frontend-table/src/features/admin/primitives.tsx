"use client";
// ── Admin UI primitives v2 — Premium dark-casino design system ───────────────
// AdminCard, KpiBar, Badge, Table, Th, Td, Row, Empty, Mono, statusTone
// Used across all 15 admin sections. Upgraded with richer elevation, gold/red
// accent system, and better table styling.
import type { ReactNode } from "react";
import { cn } from "@/features/ui/tokens";

// ── AdminCard ─────────────────────────────────────────────────────────────────
export function AdminCard({
  title,
  badge,
  action,
  children,
  className,
}: {
  title?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#181e27] p-5 shadow-[0_2px_16px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {/* Subtle top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {(title || badge || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {title && (
              <h3 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-white/60">
                {title}
              </h3>
            )}
            {badge}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── KPI bar ───────────────────────────────────────────────────────────────────
export function KpiBar({ items }: { items: { label: string; value: ReactNode; tone?: "gold" | "green" | "red" | "neutral" }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => {
        const valueTone =
          item.tone === "gold"  ? "text-[#f5c518]" :
          item.tone === "green" ? "text-[#22c55e]" :
          item.tone === "red"   ? "text-[#ff4455]" :
          "text-white";
        const borderColor =
          item.tone === "gold"  ? "rgba(245,197,24,0.18)" :
          item.tone === "green" ? "rgba(34,197,94,0.18)"  :
          item.tone === "red"   ? "rgba(224,30,43,0.18)"  :
          "rgba(255,255,255,0.08)";
        const bgColor =
          item.tone === "gold"  ? "rgba(245,197,24,0.05)" :
          item.tone === "green" ? "rgba(34,197,94,0.05)"  :
          item.tone === "red"   ? "rgba(224,30,43,0.05)"  :
          "rgba(255,255,255,0.02)";
        const accentLine =
          item.tone === "gold"  ? "linear-gradient(90deg,transparent,rgba(245,197,24,0.50),transparent)" :
          item.tone === "green" ? "linear-gradient(90deg,transparent,rgba(34,197,94,0.50),transparent)"  :
          item.tone === "red"   ? "linear-gradient(90deg,transparent,rgba(224,30,43,0.50),transparent)"  :
          "linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)";
        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl px-4 py-3.5 transition hover:-translate-y-0.5"
            style={{ border: `1px solid ${borderColor}`, background: bgColor }}
          >
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: accentLine }} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{item.label}</p>
            <p className={cn("mt-1.5 font-display text-2xl font-bold tabular-nums leading-none", valueTone)}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_TONES: Record<string, string> = {
  green:   "border-[#22c55e]/35 bg-[#22c55e]/[0.08] text-[#22c55e]",
  gold:    "border-[#f5c518]/35 bg-[#f5c518]/[0.08] text-[#f5c518]",
  red:     "border-[#e01e2b]/35 bg-[#e01e2b]/[0.08] text-[#ff4455]",
  cyan:    "border-white/15 bg-white/[0.04] text-neutral-300",
  neutral: "border-white/10 bg-white/[0.03] text-neutral-400",
};

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
        BADGE_TONES[tone] ?? BADGE_TONES.neutral,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  const s = status.toLowerCase();
  if (["verified","approved","confirmed","paid","resolved","allow","closed"].includes(s)) return "green";
  if (["pending","review","open","in_review","medium"].includes(s)) return "gold";
  if (["rejected","banned","denied","deny","dismissed","failed","high","critical"].includes(s)) return "red";
  if (["low"].includes(s)) return "cyan";
  return "neutral";
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] text-left">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("px-5 py-3 text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn("px-5 py-3.5 align-middle text-neutral-200", className)}>{children}</td>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-white/[0.04] transition hover:bg-white/[0.025]", className)}>
      {children}
    </tr>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-xl text-neutral-500">
        ◇
      </div>
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-neutral-400", className)}>{children}</span>;
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Alert strip ───────────────────────────────────────────────────────────────
export function AlertStrip({
  tone,
  children,
}: {
  tone: "red" | "gold" | "green" | "neutral";
  children: ReactNode;
}) {
  const styles: Record<string, string> = {
    red:     "border-[#e01e2b]/30 bg-[#e01e2b]/[0.06] text-[#ff4455]",
    gold:    "border-[#f5c518]/30 bg-[#f5c518]/[0.06] text-[#f5c518]",
    green:   "border-[#22c55e]/30 bg-[#22c55e]/[0.06] text-[#22c55e]",
    neutral: "border-white/10 bg-white/[0.03] text-neutral-300",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", styles[tone])}>
      {children}
    </div>
  );
}

// ── Back-compat shims ─────────────────────────────────────────────────────────
// The v2 rewrite renamed Card -> AdminCard and folded GoldHeading/StatTile into
// SectionHeader/KpiBar, but the 15 admin section files still import the v1
// names. These aliases keep those call sites working without touching them,
// while rendering in the v2 style.

export function Card({
  eyebrow,
  title,
  actions,
  action,
  badge,
  children,
  className,
}: {
  /** v1 prop: rendered as the card's heading. */
  eyebrow?: string;
  title?: string;
  /** v1 prop name for the top-right slot. */
  actions?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard
      title={eyebrow ?? title}
      badge={badge}
      action={actions ?? action}
      className={className}
    >
      {title && eyebrow && (
        <p className="-mt-2 mb-3 font-display text-sm font-semibold text-white/80">{title}</p>
      )}
      {children}
    </AdminCard>
  );
}

export function GoldHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "font-display text-lg font-bold uppercase tracking-wider",
        "bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "cyan" | "gold" | "red" | "green" | "neutral";
}) {
  const tone: Record<string, string> = {
    cyan: "text-cyan",
    gold: "text-gold",
    red: "text-brand",
    green: "text-green",
    neutral: "text-foreground",
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#181e27] p-5 shadow-[0_2px_16px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-400">{label}</p>
      <p className={cn("mt-2 font-display text-2xl font-bold tracking-tight", tone[accent])}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

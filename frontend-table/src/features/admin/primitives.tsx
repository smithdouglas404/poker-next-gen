"use client";

import type { ReactNode } from "react";

import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_LG, cn } from "@/features/ui/tokens";

// Screen-local presentational primitives for the admin console. They compose
// the shared Neon Vault tokens (GLASS_PANEL/HEADING_LG) so the console matches
// the rest of the app without re-inventing glass.

/** Gold-gradient display heading used for section titles. */
export function GoldHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        HEADING_LG,
        "bg-gradient-to-r from-[#f3e2ad] via-[#d4af37] to-[#9a7b2c] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A glass content card with an optional header row + actions. */
export function Card({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn(GLASS_PANEL, "overflow-hidden", className)}>
      {(title || actions || eyebrow) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && (
              <p className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                {title}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A headline metric tile. `accent` tints the value + glow. */
export function StatTile({
  label,
  value,
  sub,
  accent = "cyan",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "cyan" | "gold" | "red" | "green" | "neutral";
}) {
  const tone: Record<string, string> = {
    cyan: "text-cyan",
    gold: "text-gold",
    red: "text-red-400",
    green: "text-emerald-300",
    neutral: "text-foreground",
  };
  const glow: Record<string, string> = {
    cyan: "shadow-[0_0_28px_rgba(129,236,255,0.06)]",
    gold: "shadow-[0_0_28px_rgba(212,175,55,0.08)]",
    red: "shadow-[0_0_28px_rgba(255,59,70,0.06)]",
    green: "shadow-[0_0_28px_rgba(34,211,120,0.06)]",
    neutral: "",
  };
  return (
    <div className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "p-5", glow[accent])}>
      <Eyebrow>{label}</Eyebrow>
      <p className={cn("mt-2 font-display text-2xl font-bold tracking-tight", tone[accent])}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  gold: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  cyan: "border-cyan/40 bg-cyan/10 text-cyan",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  red: "border-red-500/40 bg-red-500/10 text-red-300",
  purple: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  neutral: "border-white/15 bg-white/[0.04] text-neutral-300",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a status/risk string to a badge tone. */
export function statusTone(status: string): keyof typeof BADGE_TONES {
  const s = status.toLowerCase();
  if (["verified", "approved", "confirmed", "paid", "resolved", "allow", "closed"].includes(s))
    return "green";
  if (["pending", "review", "open", "in_review", "medium"].includes(s)) return "gold";
  if (["rejected", "banned", "denied", "deny", "dismissed", "failed", "high", "critical"].includes(s))
    return "red";
  if (["low"].includes(s)) return "cyan";
  return "neutral";
}

/** Simple glass table scaffolding — always horizontally scrollable. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-5 py-3 align-middle text-neutral-200", className)}>{children}</td>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-white/[0.04] transition hover:bg-white/[0.02]", className)}>
      {children}
    </tr>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-lg text-neutral-500">
        ◇
      </div>
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-neutral-400", className)}>{children}</span>;
}

"use client";
// ── Tournament UI atoms v2 — Premium dark-casino design system ───────────────
// KpiTile, Tag, Stat, RowIcon, Eyebrow — used across Lobby, OwnerCenter,
// Leaderboard, CreatePanel. Upgraded with richer glow, gold/green accents,
// elevation shadows, and Playfair Display headings.
import type { ReactNode } from "react";
import { cn } from "@/features/ui/tokens";
import type { LobbyMeta } from "./types";

// ── Tone map ─────────────────────────────────────────────────────────────────
const TONE: Record<NonNullable<LobbyMeta["tagTone"]>, string> = {
  gold:   "border-[#f5c518]/40 bg-[#f5c518]/[0.08] text-[#f5c518]",
  cyan:   "border-white/15 bg-white/[0.05] text-neutral-300",
  green:  "border-[#22c55e]/40 bg-[#22c55e]/[0.08] text-[#22c55e]",
  purple: "border-[#a78bfa]/30 bg-[#a78bfa]/[0.06] text-[#a78bfa]",
  red:    "border-[#e01e2b]/40 bg-[#e01e2b]/[0.08] text-[#ff2d3f]",
};

// ── Tag pill ─────────────────────────────────────────────────────────────────
export function Tag({
  children,
  tone = "cyan",
  className,
}: {
  children: ReactNode;
  tone?: LobbyMeta["tagTone"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]",
        TONE[tone ?? "cyan"],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Stat column ──────────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "cyan" | "gold" | "green";
  className?: string;
}) {
  const valueTone =
    tone === "gold"  ? "text-[#f5c518]" :
    tone === "green" ? "text-[#22c55e]" :
    tone === "cyan"  ? "text-[#22c55e]" :
    "text-white";

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</p>
      <p className={cn("mt-1 font-display text-lg font-bold tabular-nums leading-none", valueTone)}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-neutral-500">{unit}</span>}
      </p>
    </div>
  );
}

// ── KPI tile (large stat card) ────────────────────────────────────────────────
export function KpiTile({
  label,
  value,
  tone = "cyan",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: "cyan" | "gold" | "green" | "red";
  hint?: string;
  icon?: string;
}) {
  const valueTone =
    tone === "gold"  ? "text-[#f5c518]" :
    tone === "green" ? "text-[#22c55e]" :
    tone === "red"   ? "text-[#ff4455]" :
    "text-white";

  const glowColor =
    tone === "gold"  ? "rgba(245,197,24,0.08)"  :
    tone === "green" ? "rgba(34,197,94,0.08)"   :
    tone === "red"   ? "rgba(224,30,43,0.08)"   :
    "rgba(255,255,255,0.04)";

  const borderColor =
    tone === "gold"  ? "rgba(245,197,24,0.18)"  :
    tone === "green" ? "rgba(34,197,94,0.18)"   :
    tone === "red"   ? "rgba(224,30,43,0.18)"   :
    "rgba(255,255,255,0.08)";

  const accentLine =
    tone === "gold"  ? "linear-gradient(90deg,transparent,rgba(245,197,24,0.50),transparent)" :
    tone === "green" ? "linear-gradient(90deg,transparent,rgba(34,197,94,0.50),transparent)"  :
    tone === "red"   ? "linear-gradient(90deg,transparent,rgba(224,30,43,0.50),transparent)"  :
    "linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)";

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4 shadow-[0_2px_16px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5"
      style={{ background: glowColor, border: `1px solid ${borderColor}` }}
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: accentLine }} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</p>
        {icon && <span className="text-base opacity-60">{icon}</span>}
      </div>
      <p className={cn("mt-1.5 font-display text-2xl font-bold tabular-nums leading-none", valueTone)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

// ── Row icon ─────────────────────────────────────────────────────────────────
export function RowIcon({ tone = "cyan", glyph }: { tone?: LobbyMeta["tagTone"]; glyph: string }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg transition group-hover:scale-105",
        TONE[tone ?? "cyan"],
      )}
    >
      {glyph}
    </div>
  );
}

// ── Eyebrow ──────────────────────────────────────────────────────────────────
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-neutral-500">{children}</p>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide text-white">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// ── Alert banner ─────────────────────────────────────────────────────────────
export function AlertBanner({
  tone,
  title,
  body,
}: {
  tone: "red" | "gold" | "steel" | "green";
  title: string;
  body: string;
}) {
  const styles: Record<string, string> = {
    red:   "border-[#e01e2b]/30 bg-[#e01e2b]/[0.06] text-[#ff4455]",
    gold:  "border-[#f5c518]/30 bg-[#f5c518]/[0.06] text-[#f5c518]",
    green: "border-[#22c55e]/30 bg-[#22c55e]/[0.06] text-[#22c55e]",
    steel: "border-white/10 bg-white/[0.03] text-neutral-300",
  };
  const icons: Record<string, string> = {
    red: "⚠", gold: "◈", green: "✓", steel: "ℹ",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5", styles[tone])}>
      <span className="mt-0.5 shrink-0 text-sm">{icons[tone]}</span>
      <div>
        <p className="text-xs font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] opacity-80">{body}</p>
      </div>
    </div>
  );
}

// Shared design tokens — the single source of truth for the GGPoker look.
// Clean solid charcoal cards on near-black, GG red brand, poker green for
// money, gold/amber for rewards. Compose these with `cn()`.
//
// ── THE MATERIAL RAMP (M1–M4) ───────────────────────────────────────────────
// Four surfaces in a fixed order of visual weight. A surface is M1, M2, M3 or
// M4 — there is no fifth panel style and no ad-hoc background.
//
//   M1 PLATE   solid gold, BLACK text          KPI tiles only. One group/screen.
//   M2 PANEL   #262d38 + gold hairline         cards, charts, containers
//   M3 RAISED  #313a46 + lift                  modals, popovers, hovered rows
//   M4 WELL    inset dark                      table bodies, list interiors, inputs
//
// This exists because the app had exactly ONE panel material, imported by 126
// files as a single identical string. A KPI tile, a chart card, a table body
// and a modal all weighed the same, so nothing led the eye — which is the bulk
// of the gap against the reference comps. Hierarchy is a property of the
// material ramp, not of the palette; no colour value changes here.

/**
 * M2 PANEL — the default card. Kept under the historic `GLASS_PANEL` name
 * because 126 files import it; redefining it here restyles all of them at once
 * rather than touching 126 call sites. It is not glassmorphism and has not been
 * since the GGPoker bake-off.
 */
export const GLASS_PANEL =
  "rounded-xl border border-[#d4af37]/[0.18] bg-[#262d38] " +
  "shadow-[0_2px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]";

/** M1 PLATE — solid gold with BLACK ink. KPI tiles only; one group per screen. */
export const PLATE =
  "rounded-xl bg-gradient-to-br from-[#ffd54a] via-[#f5c518] to-[#c9a00d] text-[#1a1206] " +
  "shadow-[0_10px_28px_-14px_rgba(245,197,24,0.5)]";

/** M2 PANEL — alias of GLASS_PANEL under its real name. Prefer this in new code. */
export const PANEL = GLASS_PANEL;

/** M3 RAISED — modals, popovers, hovered rows. One step above M2. */
export const RAISED =
  "rounded-2xl border border-[#d4af37]/[0.28] bg-[#313a46] " +
  "shadow-[0_16px_48px_rgba(0,0,0,0.55)]";

/** M4 WELL — inset interior. Table bodies, list interiors, inputs. Never a card. */
export const WELL =
  "rounded-xl bg-black/[0.22] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]";

// ── SCALE ───────────────────────────────────────────────────────────────────
// Measured against the comps: KPI values were ~30px vs ~44, page titles 18 vs
// ~40, panel padding 16–20 vs ~28, rows 40 vs 56. Everything read ~35% small.

/** 44px tabular KPI value. The number on an M1 plate. */
export const TEXT_KPI =
  "font-display text-[44px] leading-[1.05] font-bold tabular-nums tracking-[-0.02em]";

/** 34px page title. Pair with GOLD_RULE underneath. */
export const PAGE_TITLE =
  "font-display text-[34px] leading-[1.1] font-bold tracking-[-0.015em]";

/** The 2px gold rule that sits under a page title. */
export const GOLD_RULE =
  "h-0.5 w-[110px] bg-gradient-to-r from-[#f5c518] to-transparent";

/** 20px panel heading. One per panel. */
export const PANEL_TITLE = "font-display text-[20px] font-bold tracking-[-0.01em]";

/** 13px form/label text. */
export const TEXT_LABEL = "text-[13px] font-semibold text-muted";

/** Money and counts always align. */
export const TABULAR = "tabular-nums";

/** Standard interior padding for an M2 panel, and row height for a data table. */
export const PANEL_PAD = "p-7";
export const ROW_H = "h-14";

export const GLASS_PANEL_HOVER =
  "transition-all duration-200 hover:border-white/[0.12] hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)] hover:-translate-y-px";

export const BTN_GOLD =
  "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] font-bold " +
  "transition-all hover:shadow-[0_6px_18px_-6px_rgba(245,197,24,0.4)] hover:-translate-y-px active:translate-y-0";

export const BTN_RED =
  "bg-gradient-to-b from-[#ff2d3f] via-[#e01e2b] to-[#b3151f] text-white font-semibold " +
  "transition-all hover:shadow-[0_6px_18px_-6px_rgba(224,30,43,0.4)] hover:-translate-y-px active:translate-y-0";

export const BTN_GREEN =
  "bg-gradient-to-b from-[#22c55e] via-[#1c9f57] to-[#0a7d43] text-white font-semibold " +
  "transition-all hover:shadow-[0_6px_18px_-6px_rgba(34,197,94,0.4)] hover:-translate-y-px active:translate-y-0";

// Small rounded-full status pill base. Pair with tone-specific bg/border/text.
export const STATUS_CHIP =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold";

/**
 * Section heading (`<h2>Trading Floor</h2>`), NOT a page title — checked all 11
 * call sites before touching it. 18 → 20px to match PANEL_TITLE; the 34px
 * page-title step is PAGE_TITLE, which is a new export, so nothing existing
 * silently doubles in size.
 */
export const HEADING_LG = "font-display text-[20px] font-bold uppercase tracking-wider";

/**
 * The 11px eyebrow above a group. Despite the name this is the SMALLEST type in
 * the system, and 49 files depend on that — it is deliberately unchanged.
 */
export const HEADING_SM =
  "font-display text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400";

/** Clearer name for HEADING_SM. Prefer this in new code. */
export const TEXT_EYEBROW = HEADING_SM;

// Rarity retuned to the GGPoker red / green / gold system (cyan/purple retired).
export const RARITY = {
  common: { text: "text-neutral-300", border: "border-white/15", glow: "rgba(154,160,166,0.2)" },
  rare: { text: "text-[#22c55e]", border: "border-[#22c55e]/35", glow: "rgba(34,197,94,0.3)" },
  epic: { text: "text-[#ff2d3f]", border: "border-[#e01e2b]/40", glow: "rgba(224,30,43,0.35)" },
  legendary: { text: "text-[#f5c518]", border: "border-[#f5c518]/45", glow: "rgba(245,197,24,0.4)" },
} as const;

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

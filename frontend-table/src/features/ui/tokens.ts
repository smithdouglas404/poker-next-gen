// Shared design tokens — the single source of truth for the GGPoker look.
// Clean solid charcoal cards on near-black, GG red brand, poker green for
// money, gold/amber for rewards. Compose these with `cn()`.
//
// NOTE: GLASS_PANEL is kept as the exported name for backwards-compat, but it
// is no longer a glassmorphism surface — it is now the GGPoker solid "CARD".

export const GLASS_PANEL =
  "rounded-xl border border-white/[0.06] bg-[#262d38] shadow-[0_2px_12px_rgba(0,0,0,0.4)]";

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

export const HEADING_LG = "font-display text-lg font-bold uppercase tracking-wider";
export const HEADING_SM =
  "font-display text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400";

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

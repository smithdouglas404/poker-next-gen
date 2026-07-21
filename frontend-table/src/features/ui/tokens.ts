// Shared design tokens — the single source of truth for the Neon Vault look
// (ported from HighRollersClub's design-tokens). Compose these with `cn()`.

export const GLASS_PANEL =
  "rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl";

export const GLASS_PANEL_HOVER =
  "transition-all duration-300 hover:border-white/20 hover:shadow-[0_0_24px_rgba(129,236,255,0.08)]";

export const BTN_GOLD =
  "bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] text-black font-bold " +
  "transition-all hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] hover:scale-[1.01] active:scale-[0.99]";

export const HEADING_LG = "font-display text-lg font-bold uppercase tracking-wider";
export const HEADING_SM =
  "font-display text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400";

export const RARITY = {
  common: { text: "text-gray-300", border: "border-gray-500/25", glow: "rgba(156,163,175,0.2)" },
  rare: { text: "text-sky-300", border: "border-sky-500/30", glow: "rgba(96,165,250,0.25)" },
  epic: { text: "text-purple-300", border: "border-purple-500/30", glow: "rgba(168,85,247,0.3)" },
  legendary: { text: "text-amber-300", border: "border-amber-500/40", glow: "rgba(245,158,11,0.35)" },
} as const;

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

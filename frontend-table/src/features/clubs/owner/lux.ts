// Screen-local "gold vault" treatment for the Club-Owner Hub (/clubs).
//
// This is a PROOF of a gold-luxury direction layered only on this screen — it
// intentionally does NOT touch the global Neon-Vault tokens (globals.css /
// features/ui/tokens.ts). The palette here is gold/brass/amber forward over a
// warm server-vault depth, matching the owner master screenshot. Compose these
// with `cn()` exactly like the shared tokens.

/** Real frosted glass tuned to float OVER the warm depth background: warm-tinted
 * translucency, a soft top ghost-border, and a diffuse dark ambient shadow so
 * backdrop-blur reads as physical glass rather than a flat rectangle. */
export const LUX_GLASS =
  "rounded-2xl border border-[#d4af37]/12 bg-[rgba(22,17,9,0.42)] backdrop-blur-2xl " +
  "shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]";

/** Elevated / important glass — a luminous gold edge + gold-tinted ambient glow.
 * Reserve for active panels (the Member registry, active nav, primary cards). */
export const LUX_GLASS_GOLD =
  "rounded-2xl border border-[#d4af37]/35 bg-[rgba(30,23,10,0.5)] backdrop-blur-2xl " +
  "shadow-[0_0_44px_-10px_rgba(212,175,55,0.24),0_24px_60px_-24px_rgba(0,0,0,0.85)," +
  "inset_0_1px_0_rgba(243,226,173,0.14)]";

/** Hover lift for interactive glass — warms the surface + gold rim glow. */
export const LUX_GLASS_HOVER =
  "transition-all duration-300 hover:border-[#d4af37]/30 " +
  "hover:shadow-[0_0_36px_-8px_rgba(212,175,55,0.22),0_24px_60px_-24px_rgba(0,0,0,0.85)]";

/** Warm translucent row wash (registry rows / inner tiles) over the depth. */
export const LUX_ROW =
  "border border-white/[0.05] bg-[rgba(212,175,55,0.03)] transition-colors " +
  "hover:bg-[rgba(212,175,55,0.07)]";

/** Primary gold gradient CTA — brass→gold→champagne, black bold text. */
export const LUX_BTN_GOLD =
  "bg-gradient-to-b from-[#f3e2ad] via-[#d4af37] to-[#9a7b2c] text-[#1a1205] font-bold " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_18px_-6px_rgba(212,175,55,0.5)] " +
  "transition-all hover:shadow-[0_0_24px_rgba(212,175,55,0.45)] hover:brightness-110 " +
  "active:scale-[0.98]";

/** Quiet brass-outline control (secondary actions). */
export const LUX_BTN_OUTLINE =
  "border border-[#d4af37]/30 bg-[rgba(212,175,55,0.04)] text-[#f3e2ad] " +
  "transition hover:border-[#d4af37]/55 hover:bg-[rgba(212,175,55,0.1)] hover:text-[#fbf0cf]";

/** Gold eyebrow / section label. */
export const LUX_EYEBROW =
  "font-display text-[11px] font-bold uppercase tracking-[0.28em] text-[#e7c766]";

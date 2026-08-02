// ============================================================
// HIGH ROLLERS CLUB — Design Token System v2
// Premium dark casino aesthetic: deep slate base, gold brand,
// GG red action, poker green for money, layered elevation.
// All tokens are Tailwind utility strings — compose with cn().
// ============================================================

// ── Elevation / Surface ──────────────────────────────────────
export const SURFACE_BASE = "bg-[#0f1318]";

// GLASS_PANEL kept as primary surface name for backwards-compat
export const GLASS_PANEL =
  "rounded-2xl border border-white/[0.08] bg-[#181e27] shadow-[0_2px_16px_rgba(0,0,0,0.45)]";

export const GLASS_PANEL_HOVER =
  "transition hover:border-white/[0.14] hover:shadow-[0_6px_24px_rgba(0,0,0,0.55)] hover:-translate-y-px";

export const SURFACE_2 =
  "rounded-2xl border border-white/[0.09] bg-[#222a38] shadow-[0_2px_16px_rgba(0,0,0,0.4)]";

export const SURFACE_3 =
  "rounded-2xl border border-white/[0.12] bg-[#2a3344] shadow-[0_8px_40px_rgba(0,0,0,0.6)]";

// ── Buttons ──────────────────────────────────────────────────
export const BTN_GOLD =
  "bg-gradient-to-b from-[#ffe066] via-[#f5c518] to-[#c9a000] text-[#1a1200] font-bold " +
  "shadow-[0_2px_12px_rgba(245,197,24,0.30)] " +
  "transition-all duration-150 hover:from-[#ffe880] hover:via-[#ffd030] hover:to-[#d4a80f] " +
  "hover:shadow-[0_6px_22px_rgba(245,197,24,0.50)] hover:-translate-y-px active:translate-y-0 active:shadow-none";

export const BTN_RED =
  "bg-gradient-to-b from-[#ff4455] via-[#e01e2b] to-[#b3151f] text-white font-semibold " +
  "shadow-[0_2px_12px_rgba(224,30,43,0.30)] " +
  "transition-all duration-150 hover:from-[#ff5566] hover:shadow-[0_6px_22px_rgba(224,30,43,0.50)] " +
  "hover:-translate-y-px active:translate-y-0";

export const BTN_GREEN =
  "bg-gradient-to-b from-[#34d972] via-[#22c55e] to-[#0a7d43] text-white font-semibold " +
  "shadow-[0_2px_12px_rgba(34,197,94,0.25)] " +
  "transition-all duration-150 hover:shadow-[0_6px_22px_rgba(34,197,94,0.45)] " +
  "hover:-translate-y-px active:translate-y-0";

export const BTN_OUTLINE =
  "border border-white/20 bg-white/[0.04] text-white font-semibold backdrop-blur-sm " +
  "transition-all duration-150 hover:border-white/35 hover:bg-white/[0.08] hover:-translate-y-px";

export const BTN_GHOST =
  "text-neutral-300 font-medium transition-all duration-150 " +
  "hover:bg-white/[0.06] hover:text-white";

// ── Status / Pill chips ──────────────────────────────────────
export const STATUS_CHIP =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide";

// ── Typography ───────────────────────────────────────────────
export const HEADING_XL =
  "font-display text-4xl font-bold uppercase tracking-tight leading-[1.02]";

export const HEADING_LG =
  "font-display text-2xl font-bold uppercase tracking-wide";

export const HEADING_MD =
  "font-display text-lg font-bold uppercase tracking-wide";

export const HEADING_SM =
  "font-display text-[11px] font-bold uppercase tracking-[0.28em] text-neutral-400";

export const LABEL_SM =
  "text-[11px] font-semibold uppercase tracking-[0.22em]";

// ── Divider ──────────────────────────────────────────────────
export const DIVIDER = "border-t border-white/[0.07]";

// ── Glow accents ─────────────────────────────────────────────
export const GLOW = {
  gold:  "0 0 28px rgba(245,197,24,0.40)",
  red:   "0 0 28px rgba(224,30,43,0.40)",
  green: "0 0 28px rgba(34,197,94,0.35)",
  cyan:  "0 0 28px rgba(74,158,176,0.35)",
  white: "0 0 28px rgba(255,255,255,0.12)",
} as const;

// ── Rarity system ────────────────────────────────────────────
export const RARITY = {
  common: {
    text: "text-neutral-300", border: "border-white/15",
    bg: "bg-white/[0.04]", glow: "rgba(154,160,166,0.20)", label: "Common",
  },
  rare: {
    text: "text-[#22c55e]", border: "border-[#22c55e]/35",
    bg: "bg-[#22c55e]/[0.06]", glow: "rgba(34,197,94,0.30)", label: "Rare",
  },
  epic: {
    text: "text-[#a78bfa]", border: "border-[#a78bfa]/40",
    bg: "bg-[#a78bfa]/[0.07]", glow: "rgba(167,139,250,0.30)", label: "Epic",
  },
  legendary: {
    text: "text-[#f5c518]", border: "border-[#f5c518]/45",
    bg: "bg-[#f5c518]/[0.07]", glow: "rgba(245,197,24,0.40)", label: "Legendary",
  },
  mythic: {
    text: "text-[#ff4455]", border: "border-[#ff4455]/45",
    bg: "bg-[#ff4455]/[0.07]", glow: "rgba(255,68,85,0.40)", label: "Mythic",
  },
} as const;

// ── Status colors ────────────────────────────────────────────
export const STATUS_COLORS = {
  live:      { text: "text-[#22c55e]",  border: "border-[#22c55e]/40",  bg: "bg-[#22c55e]/[0.08]"  },
  pending:   { text: "text-[#f5c518]",  border: "border-[#f5c518]/40",  bg: "bg-[#f5c518]/[0.08]"  },
  draft:     { text: "text-neutral-400",border: "border-white/15",       bg: "bg-white/[0.04]"       },
  cancelled: { text: "text-[#ff4455]",  border: "border-[#ff4455]/35",  bg: "bg-[#ff4455]/[0.06]"  },
  completed: { text: "text-[#4a9eb0]",  border: "border-[#4a9eb0]/35",  bg: "bg-[#4a9eb0]/[0.06]"  },
  active:    { text: "text-[#22c55e]",  border: "border-[#22c55e]/40",  bg: "bg-[#22c55e]/[0.08]"  },
  warning:   { text: "text-[#f97316]",  border: "border-[#f97316]/40",  bg: "bg-[#f97316]/[0.08]"  },
} as const;

// ── Sidebar nav ──────────────────────────────────────────────
export const NAV_ITEM_BASE =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150";

export const NAV_ITEM_ACTIVE =
  "bg-[#f5c518]/[0.12] text-[#f5c518] border border-[#f5c518]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export const NAV_ITEM_IDLE =
  "text-neutral-400 hover:bg-white/[0.06] hover:text-white";

// ── Card accent bar ──────────────────────────────────────────
export const CARD_ACCENT_BAR =
  "pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl";

// ── Input / Form ─────────────────────────────────────────────
export const INPUT_BASE =
  "w-full rounded-xl border border-white/[0.10] bg-[#0f1318]/80 px-4 py-2.5 text-sm text-white " +
  "placeholder:text-neutral-600 outline-none transition-all duration-150 " +
  "focus:border-[#f5c518]/50 focus:ring-2 focus:ring-[#f5c518]/10 focus:bg-[#0f1318]";

export const SELECT_BASE =
  "w-full rounded-xl border border-white/[0.10] bg-[#0f1318]/80 px-4 py-2.5 text-sm text-white " +
  "outline-none transition-all duration-150 " +
  "focus:border-[#f5c518]/50 focus:ring-2 focus:ring-[#f5c518]/10";

// ── Table ────────────────────────────────────────────────────
export const TABLE_ROW_BASE =
  "border-b border-white/[0.05] transition-colors duration-100 hover:bg-white/[0.03]";

export const TABLE_HEADER =
  "text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-500 py-3 px-4";

export const TABLE_CELL = "py-3 px-4 text-sm text-neutral-200";

// ── Brand palette reference ──────────────────────────────────
export const BRAND = {
  gold:      "#f5c518",
  goldLight: "#ffe066",
  goldDark:  "#c9a000",
  red:       "#e01e2b",
  redBright: "#ff4455",
  green:     "#22c55e",
  greenDeep: "#0a7d43",
  cyan:      "#4a9eb0",
  bg:        "#0f1318",
  surface:   "#1a2030",
  surface2:  "#222a38",
  surface3:  "#2a3344",
  muted:     "#c2c8d0",
} as const;

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

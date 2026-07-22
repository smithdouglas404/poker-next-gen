// Per-tier presentation metadata (accent ring / glow / label color) and the
// canonical "key limits" projection used by the pricing cards + comparison
// table. Values are DERIVED from the server TierDef — never invented.

import { intCompact, moneyCompact } from "./membershipRpc";
import type { TierDef } from "./types";

export interface TierAccent {
  /** Ring shown when this tier is the caller's current plan. */
  ring: string;
  /** Static border tint for the card. */
  border: string;
  /** Text tint for the tier name. */
  text: string;
  /** rgba glow used behind the header / current badge. */
  glow: string;
  /** Short marketing eyebrow. */
  tagline: string;
}

export const TIER_ACCENT: Record<string, TierAccent> = {
  free: {
    ring: "ring-white/30",
    border: "border-white/10",
    text: "text-neutral-200",
    glow: "rgba(255,255,255,0.10)",
    tagline: "Play chips",
  },
  bronze: {
    ring: "ring-amber-700/60",
    border: "border-amber-700/40",
    text: "text-amber-500",
    glow: "rgba(180,120,60,0.22)",
    tagline: "Micro stakes",
  },
  silver: {
    ring: "ring-slate-300/50",
    border: "border-slate-300/30",
    text: "text-slate-200",
    glow: "rgba(203,213,225,0.20)",
    tagline: "Mid stakes",
  },
  gold: {
    ring: "ring-gold/70",
    border: "border-gold/40",
    text: "text-gold",
    glow: "rgba(212,175,55,0.28)",
    tagline: "High stakes",
  },
  platinum: {
    ring: "ring-cyan/60",
    border: "border-cyan/40",
    text: "text-cyan",
    glow: "rgba(129,236,255,0.24)",
    tagline: "Unlimited",
  },
};

export function accentFor(id: string): TierAccent {
  return TIER_ACCENT[id] ?? TIER_ACCENT.free;
}

export interface LimitRow {
  label: string;
  value: string;
}

/** Human "unlimited" for the 0 / -1 sentinels documented in billing/tiers.go. */
function bigBlind(t: TierDef): string {
  if (t.id === "platinum") return "Unlimited";
  if (t.max_big_blind_cents <= 0) return "Play chips";
  return `${moneyCompact(t.max_big_blind_cents)} BB`;
}

function tourney(t: TierDef): string {
  if (t.tournament_buy_in_max_cents === 0) {
    return t.id === "free" ? "Freerolls only" : "Unlimited";
  }
  return `Up to ${moneyCompact(t.tournament_buy_in_max_cents)}`;
}

function clubs(t: TierDef): string {
  if (t.club_create_limit < 0) return "Unlimited";
  if (t.club_create_limit === 0) return "Join only";
  const members = t.club_member_limit < 0 ? "unlimited" : intCompact(t.club_member_limit);
  return `${t.club_create_limit} × ${members} members`;
}

/** The compact spec grid shown on every pricing card. */
export function keyLimits(t: TierDef): LimitRow[] {
  return [
    { label: "Stakes", value: bigBlind(t) },
    { label: "Rakeback", value: t.rakeback_percent > 0 ? `${t.rakeback_percent}%` : "—" },
    { label: "Daily deposit", value: t.deposit_limit_daily_cents > 0 ? moneyCompact(t.deposit_limit_daily_cents) : "—" },
    { label: "Weekly withdraw", value: t.withdraw_limit_weekly_cents > 0 ? moneyCompact(t.withdraw_limit_weekly_cents) : "—" },
    { label: "Tournaments", value: tourney(t) },
    { label: "Multi-table", value: `${t.multi_table_limit}` },
    { label: "Clubs", value: clubs(t) },
    { label: "Daily bonus", value: `${intCompact(t.daily_bonus_chips)} chips` },
  ];
}

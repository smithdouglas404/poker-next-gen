// Avatar-tier marketplace helpers: dual-currency (Gold / ETH) presentation over
// the authoritative USD `price_cents`, plus a clearly-labeled demo avatar catalog
// used only when the live `cosmetic_list` catalog has no avatars (guest / offline).
//
// Purchases always settle through the real `cosmetic_buy` RPC at `price_cents`;
// Gold/ETH are thematic display equivalents derived deterministically from cents.

import { avatarSrc } from "@/features/table/avatars";
import type { Cosmetic } from "./types";

/** Kinds that render as full-body avatar/character cards in the tier grids. */
export const AVATAR_KINDS = new Set(["model", "avatar", "character"]);

export function isAvatarKind(kind: string | undefined): boolean {
  return AVATAR_KINDS.has((kind ?? "").toLowerCase());
}

/** Gold display amount — 1 USD cent == 1 Gold (so $500.00 → 50,000 Gold). */
export function goldOf(cents: number): number {
  return Math.max(0, Math.round(cents));
}

/** Thematic ETH equivalent, derived from Gold (never a real on-chain quote). */
export function ethOf(cents: number): number {
  return goldOf(cents) / 100_000;
}

export function fmtGold(cents: number): string {
  return `${goldOf(cents).toLocaleString()} Gold`;
}

export function fmtEth(cents: number): string {
  const eth = ethOf(cents);
  return `${eth.toLocaleString(undefined, { minimumFractionDigits: eth < 1 ? 1 : 2, maximumFractionDigits: 3 })} ETH`;
}

/** True for locally-simulated demo items (never live inventory). */
export function isDemoCosmeticId(id: string): boolean {
  return id.startsWith("av-demo") || id.startsWith("cos-demo") || id.startsWith("cat-demo");
}

function avatar(
  id: string,
  name: string,
  rarity: string,
  portraitId: string,
  priceCents: number,
): Cosmetic {
  return {
    id,
    kind: "model",
    name,
    rarity,
    asset_ref: "",
    preview_ref: avatarSrc(portraitId),
    price_cents: priceCents,
  };
}

/**
 * Basic tier — standard avatars offered at accessible prices. Labeled demo data,
 * surfaced only when the live catalog returns no avatar-kind cosmetics.
 */
export const DEMO_BASIC_AVATARS: Cosmetic[] = [
  avatar("av-demo-b1", "Steel Ghost", "rare", "steel-ghost", 5_000),
  avatar("av-demo-b2", "Neon Fox", "rare", "neon-fox", 6_000),
  avatar("av-demo-b3", "Street Racer", "rare", "street-racer", 6_500),
  avatar("av-demo-b4", "Data Thief", "rare", "data-thief", 7_500),
  avatar("av-demo-b5", "Bolt Runner", "common", "bolt-runner", 4_000),
  avatar("av-demo-b6", "Iron Bull", "common", "iron-bull", 4_500),
];

/**
 * Premium tier — the "Cyber-Knight" line and other high-rarity drops.
 */
export const DEMO_PREMIUM_AVATARS: Cosmetic[] = [
  avatar("av-demo-p1", "Cyber-Knight X1", "epic", "cyber-samurai", 50_000),
  avatar("av-demo-p2", "Cyber-Knight X2", "epic", "punk-duchess", 50_000),
  avatar("av-demo-p3", "Cyber-Knight X3", "epic", "mech-pilot", 50_000),
  avatar("av-demo-p4", "Cyber-Knight X4", "legendary", "shadow-king", 50_000),
  avatar("av-demo-p5", "Cyber-Knight X5", "epic", "ghost-sniper", 50_000),
  avatar("av-demo-p6", "Cyber-Knight X6", "legendary", "red-wolf", 50_000),
];

/** Ultra-rare 1/1 exclusives for the Premium Exclusive marketplace view. */
export const DEMO_EXCLUSIVE_AVATARS: (Cosmetic & { blurb: string })[] = [
  { ...avatar("av-demo-x1", "Mythic · Athena Prime", "legendary", "void-witch", 25_000), blurb: "Ancient wisdom, modern warfare. 1/1." },
  { ...avatar("av-demo-x2", "1/1 Exclusive · Golden Spartan", "legendary", "gold-phantom", 30_000), blurb: "Unbreakable defense. Unique build." },
  { ...avatar("av-demo-x3", "1/1 Exclusive · Aureate Vanguard", "legendary", "tech-monk", 30_000), blurb: "Forged in gold. One of one." },
  { ...avatar("av-demo-x4", "Mythic · Neon Empress", "legendary", "chrome-siren", 28_000), blurb: "Radiant command presence. 1/1." },
  { ...avatar("av-demo-x5", "1/1 Exclusive · Obsidian Titan", "legendary", "cyber-samurai", 32_000), blurb: "Absolute power, singular form." },
  { ...avatar("av-demo-x6", "Mythic · Oracle Ascendant", "legendary", "oracle-seer", 27_000), blurb: "Sees every river. One of one." },
];

/** Short marketing blurb for any avatar (falls back to a generic line). */
export function avatarBlurb(c: Cosmetic): string {
  const withBlurb = DEMO_EXCLUSIVE_AVATARS.find((a) => a.id === c.id);
  if (withBlurb) return withBlurb.blurb;
  return c.rarity === "legendary"
    ? "Legendary-tier drop. Ultra-rare finish."
    : "Premium avatar with signature neon detailing.";
}

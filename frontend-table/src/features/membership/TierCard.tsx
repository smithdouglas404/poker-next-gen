"use client";

import { motion } from "framer-motion";
import { Crown, Gem, Shield, Star, Zap } from "lucide-react";
import { Button } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";
import { LIFT, SPRINGS } from "@/features/ui/motion";

import { priceLabel } from "./membershipRpc";
import { accentFor, keyLimits } from "./tierMeta";
import type { BillingInterval, TierDef } from "./types";

// Each tier gets its own mark so the ladder is legible at a glance rather than
// five identical slabs distinguishable only by price.
const TIER_ICON: Record<string, typeof Shield> = {
  free: Zap,
  bronze: Shield,
  silver: Star,
  gold: Crown,
  platinum: Gem,
};

/** The tier's `kyc_level` (server value) as the band label shown on the card. */
function kycBand(level: string): string {
  const l = (level || "").toLowerCase();
  if (!l || l === "none") return "KYC: NONE";
  if (l === "email") return "KYC: EMAIL";
  if (l === "basic") return "KYC: BASIC";
  if (l === "full") return "KYC: FULL";
  if (l === "enhanced") return "KYC: ENHANCED";
  return `KYC: ${l.toUpperCase()}`;
}

interface TierCardProps {
  tier: TierDef;
  interval: BillingInterval;
  isCurrent: boolean;
  isDowngrade: boolean;
  featured: boolean;
  busy: boolean;
  locked: boolean;
  onSelect: () => void;
}

export function TierCard({
  tier,
  interval,
  isCurrent,
  isDowngrade,
  featured,
  busy,
  locked,
  onSelect,
}: TierCardProps) {
  const accent = accentFor(tier.id);
  const Icon = TIER_ICON[tier.id] ?? Shield;
  const price = interval === "year" ? tier.annual_price_cents : tier.monthly_price_cents;
  const perYearMonthly = tier.monthly_price_cents * 12;
  const annualSave = perYearMonthly - tier.annual_price_cents;
  const isFree = tier.id === "free";

  const ctaLabel = isCurrent
    ? "Current plan"
    : isFree
      ? "Included"
      : isDowngrade
        ? "Downgrade"
        : busy
          ? "Starting…"
          : locked
            ? "Verify to unlock"
            : "Upgrade";

  return (
    // `layout="position"` makes the card SLIDE to its new position when the month/year
    // toggle reflows the grid, instead of snapping. It must be "position" and not a bare
    // `layout`: the full variant also animates SIZE, which means framer measures and pins
    // an explicit height on the element — that defeats the grid's `align-items: stretch`
    // and is exactly why the five cards used to end at five different heights. Position-only
    // keeps the FLIP motion while letting the row stretch them equal.
    // LIFT gives weight on hover/press; both animate transform only, so this composites on
    // the GPU with no layout or paint.
    <motion.div
      layout="position"
      transition={SPRINGS.smooth}
      {...LIFT}
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "relative flex h-full flex-col p-5",
        accent.border,
        featured && "md:-translate-y-1",
        isCurrent && cn("ring-2", accent.ring),
      )}
      style={{
        backgroundImage: accent.wash,
        ...(featured ? { boxShadow: `0 0 40px ${accent.glow}` } : {}),
      }}
    >
      {featured && !isCurrent && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-black">
          Most popular
        </span>
      )}

      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-500">
          {accent.tagline}
        </span>
        {isCurrent && (
          <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", accent.border, accent.text)}>
            Active
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Icon className={cn("h-5 w-5 shrink-0", accent.text)} aria-hidden />
        <h3 className={cn("font-display text-2xl font-bold uppercase tracking-wide", accent.text)}>
          {tier.name}
        </h3>
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold text-foreground">{priceLabel(price)}</span>
        {price > 0 && (
          <span className="text-xs text-neutral-500">/{interval === "year" ? "yr" : "mo"}</span>
        )}
      </div>
      {interval === "year" && !isFree && annualSave > 0 ? (
        <p className="mt-1 text-[11px] font-semibold text-emerald-300">
          Save ${(annualSave / 100).toFixed(0)}/yr vs monthly
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-neutral-600">
          {isFree ? "No card required" : `Billed ${interval === "year" ? "annually" : "monthly"}`}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/[0.06] pt-4">
        {keyLimits(tier).map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
              {row.label}
            </dt>
            <dd className="truncate text-[12px] font-semibold text-neutral-200" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Identity requirement, straight off the server tier's `kyc_level`. Players
          need to know what a tier will ask of them BEFORE they click Upgrade —
          cyan because CLAUDE.md reserves it for the verification accent. */}
      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3">
        <Shield className="h-3 w-3 shrink-0 text-cyan" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">
          {kycBand(tier.kyc_level)}
        </span>
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 text-[11px] text-neutral-400">
        {tier.benefits.slice(0, 5).map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-px text-green">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={featured ? "gold" : isCurrent ? "ghost" : "outline"}
        onClick={onSelect}
        disabled={isFree || isCurrent || isDowngrade || busy}
        className="mt-5 w-full"
      >
        {ctaLabel}
      </Button>
    </motion.div>
  );
}

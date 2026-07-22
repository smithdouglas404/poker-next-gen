"use client";

import { Button } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

import { priceLabel } from "./membershipRpc";
import { accentFor, keyLimits } from "./tierMeta";
import type { BillingInterval, TierDef } from "./types";

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
    <div
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "relative flex flex-col p-5",
        accent.border,
        featured && "md:-translate-y-1",
        isCurrent && cn("ring-2", accent.ring),
      )}
      style={featured ? { boxShadow: `0 0 40px ${accent.glow}` } : undefined}
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

      <h3 className={cn("font-display mt-1 text-2xl font-bold uppercase tracking-wide", accent.text)}>
        {tier.name}
      </h3>

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

      <ul className="mt-4 flex-1 space-y-1.5 text-[11px] text-neutral-400">
        {tier.benefits.slice(0, 5).map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-px text-cyan">✓</span>
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
    </div>
  );
}

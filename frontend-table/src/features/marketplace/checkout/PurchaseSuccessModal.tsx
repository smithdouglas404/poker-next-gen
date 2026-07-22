"use client";

import { useMemo } from "react";

import { BTN_GOLD, cn } from "@/features/ui/tokens";
import { CosmeticThumb } from "@/features/marketplace/CosmeticThumb";
import { formatGold } from "./cart";
import type { CartItem } from "./types";

// Celebration modal shown after a settled purchase — "PURCHASE SUCCESSFUL!"
// with a gold-confetti burst, the hero item, and the two HRC exits
// (View in Wardrobe / Back to Market). Component-local keyframes only; it
// does not touch globals.css. Confetti is gated on prefers-reduced-motion.

const CONFETTI_COUNT = 28;

function usePrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PurchaseSuccessModal({
  items,
  totalGold,
  onWardrobe,
  onBackToMarket,
}: {
  items: CartItem[];
  totalGold: number;
  onWardrobe: () => void;
  onBackToMarket: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const hero = items[0];

  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: `${(i / CONFETTI_COUNT) * 100 + (i % 3) * 4}%`,
        delay: `${(i % 7) * 0.18}s`,
        duration: `${1.6 + (i % 5) * 0.35}s`,
        size: 6 + (i % 4) * 3,
        rot: (i % 2 === 0 ? 1 : -1) * (40 + (i % 6) * 30),
        gold: i % 3 !== 0,
      })),
    [],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Purchase successful"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <style>{PKGO_CONFETTI_CSS}</style>

      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onBackToMarket}
        className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
      />

      {/* Confetti layer */}
      {!reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="pkgo-confetti absolute -top-6 rounded-[2px]"
              style={{
                left: c.left,
                width: c.size,
                height: c.size * 1.6,
                animationDelay: c.delay,
                animationDuration: c.duration,
                background: c.gold
                  ? "linear-gradient(180deg,#ffe27a,#f5c518 60%,#d4a80f)"
                  : "linear-gradient(180deg,#fff6cf,#f5c518)",
                boxShadow: "0 0 8px rgba(245,197,24,0.55)",
                // custom prop consumed by the keyframes for horizontal drift + spin
                ["--pkgo-rot" as string]: `${c.rot}deg`,
              }}
            />
          ))}
        </div>
      )}

      {/* Card */}
      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#f5c518]/35",
          "bg-gradient-to-b from-[#1c1a12] via-[#1c2128] to-[#0b0d0f]",
          "shadow-[0_0_60px_-10px_rgba(245,197,24,0.35)]",
        )}
      >
        {/* Radiant gold glow behind the hero */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              "radial-gradient(60% 70% at 50% 40%, rgba(245,197,24,0.35), rgba(245,197,24,0.08) 45%, transparent 70%)",
          }}
        />

        <div className="relative flex flex-col items-center gap-5 p-8 text-center">
          <h2
            className={cn(
              "font-display text-3xl font-bold uppercase tracking-[0.12em] sm:text-4xl",
              !reduced && "pkgo-pop",
            )}
            style={{
              color: "#f5c518",
              textShadow: "0 0 24px rgba(245,197,24,0.55), 0 2px 0 rgba(0,0,0,0.4)",
            }}
          >
            Purchase Successful!
          </h2>

          {/* Hero item */}
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-6 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(245,197,24,0.4), transparent 65%)",
              }}
            />
            <div className="relative w-40 overflow-hidden rounded-2xl border border-[#f5c518]/40 shadow-[0_0_36px_-6px_rgba(245,197,24,0.5)]">
              <CosmeticThumb
                preview={hero?.preview}
                kind={hero?.kind}
                rarity={hero?.rarity}
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-neutral-300">
              {items.length === 1
                ? hero?.name
                : `${items.length} items added to your collection`}
            </p>
            <p className="font-display text-lg font-bold text-gold">
              {formatGold(totalGold)}
            </p>
          </div>

          <div className="mt-2 w-full space-y-3">
            <button
              type="button"
              onClick={onWardrobe}
              className={cn(
                BTN_GOLD,
                "w-full rounded-xl px-6 py-3 text-sm uppercase tracking-[0.18em]",
              )}
            >
              View in Wardrobe
            </button>
            <button
              type="button"
              onClick={onBackToMarket}
              className="w-full text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 underline underline-offset-4 transition hover:text-gold"
            >
              Back to Market
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Local keyframes — unique `pkgo-` prefix so they never collide with globals.css.
const PKGO_CONFETTI_CSS = `
@keyframes pkgoFall {
  0%   { transform: translateY(-10%) translateX(0) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translateY(105vh) translateX(24px) rotate(var(--pkgo-rot, 180deg)); opacity: 0; }
}
@keyframes pkgoPop {
  0%   { transform: scale(0.7); opacity: 0; }
  60%  { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.pkgo-confetti { animation-name: pkgoFall; animation-timing-function: ease-in; animation-iteration-count: infinite; }
.pkgo-pop { animation: pkgoPop 0.5s ease-out both; }
`;

"use client";

import { useMemo } from "react";

import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";
import { CosmeticThumb } from "./CosmeticThumb";
import { rarityStyle, usd } from "./rarity";
import { DEMO_EXCLUSIVE_AVATARS, avatarBlurb, isAvatarKind } from "./avatars";
import type { Cosmetic } from "./types";

/**
 * detailed_19 — Premium Avatar Marketplace View ("Premium Exclusive").
 * Showcase grid of 1/1 / mythic-tier avatars with a 360° preview affordance,
 * short blurb, and dual Gold/ETH pricing. Buy hits the real `cosmetic_buy` RPC;
 * the star toggles the real `cosmetic_wishlist_*` RPC.
 */
export function PremiumMarket({
  catalog,
  ownedIds,
  wishlistIds,
  busy,
  onBuy,
  onWishlist,
}: {
  catalog: Cosmetic[];
  ownedIds: Set<string>;
  wishlistIds: Set<string>;
  busy: string | null;
  onBuy: (c: Cosmetic) => void;
  onWishlist: (c: Cosmetic) => void;
}) {
  const exclusives = useMemo<Cosmetic[]>(() => {
    const live = catalog.filter((c) => isAvatarKind(c.kind) && c.rarity === "legendary");
    return live.length > 0 ? live : DEMO_EXCLUSIVE_AVATARS;
  }, [catalog]);

  return (
    <div className="space-y-6">
      {/* Premium Exclusive banner */}
      <div
        className={cn(
          GLASS_PANEL,
          "border-gold/30 py-6 text-center",
          "bg-gradient-to-b from-gold/[0.06] to-transparent",
        )}
      >
        <h2 className="bg-gradient-to-b from-[#ffe9a8] via-[#f5c518] to-[#c99700] bg-clip-text font-display text-4xl font-bold uppercase tracking-wide text-transparent">
          Premium Exclusive
        </h2>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-neutral-400">
          Mythic & 1/1 Drops
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {exclusives.map((c) => {
          const owned = ownedIds.has(c.id);
          const wished = wishlistIds.has(c.id);
          const style = rarityStyle(c.rarity);
          return (
            <div
              key={c.id}
              className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "overflow-hidden", style.border)}
            >
              <div className="relative">
                <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                {/* 360° preview affordance */}
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-200 backdrop-blur-md">
                  <span aria-hidden>↻</span> 360°
                </span>
                <button
                  type="button"
                  onClick={() => onWishlist(c)}
                  disabled={busy !== null}
                  aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                  className={cn(
                    "absolute right-2 top-2 rounded-full border px-2 py-1 text-sm backdrop-blur-md transition",
                    wished
                      ? "border-gold/50 bg-black/50 text-gold"
                      : "border-white/15 bg-black/40 text-neutral-400 hover:text-gold",
                  )}
                >
                  {wished ? "★" : "☆"}
                </button>
              </div>
              <div className="space-y-1.5 p-4">
                <p className={cn("truncate font-display text-base font-bold", style.text)}>{c.name}</p>
                <p className="text-xs text-neutral-400">{avatarBlurb(c)}</p>
                <p className="pt-1 font-display text-sm font-bold text-gold">{usd(c.price_cents)}</p>
                {owned ? (
                  <span className="mt-1 inline-flex w-full items-center justify-center rounded-lg border border-[#22c55e]/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-green">
                    Owned
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onBuy(c)}
                    className={cn(
                      BTN_GOLD,
                      "mt-1 w-full rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-wider disabled:opacity-40",
                    )}
                  >
                    {busy === "shopbuy" + c.id ? "Acquiring…" : "Acquire"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

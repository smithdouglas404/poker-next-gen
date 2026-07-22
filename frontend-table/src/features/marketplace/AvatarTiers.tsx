"use client";

import { useMemo, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_LG, cn } from "@/features/ui/tokens";
import { CosmeticThumb } from "./CosmeticThumb";
import { rarityStyle } from "./rarity";
import {
  DEMO_BASIC_AVATARS,
  DEMO_PREMIUM_AVATARS,
  fmtEth,
  fmtGold,
  goldOf,
  isAvatarKind,
} from "./avatars";
import type { Cosmetic } from "./types";

type Tier = "premium" | "basic";
type Pay = "gold" | "eth";

/**
 * detailed_14 — Avatar Marketplace and Tiers.
 * Premium/Basic avatar grid with a live Purchase Summary cart. Each "Add"
 * queues an item; "Complete Purchase" settles every queued item through the
 * real `cosmetic_buy` RPC (via `onCheckout`). Empty live catalogs fall back to
 * clearly-labeled demo avatars so the tier grid is always demonstrable.
 */
export function AvatarTiers({
  catalog,
  ownedIds,
  busy,
  onCheckout,
}: {
  catalog: Cosmetic[];
  ownedIds: Set<string>;
  busy: string | null;
  onCheckout: (items: Cosmetic[], pay: Pay) => void | Promise<void>;
}) {
  const [tier, setTier] = useState<Tier>("premium");
  const [cart, setCart] = useState<Cosmetic[]>([]);
  const [pay, setPay] = useState<Pay>("gold");

  const liveAvatars = useMemo(() => catalog.filter((c) => isAvatarKind(c.kind)), [catalog]);

  const premium = useMemo(() => {
    const live = liveAvatars.filter((c) => c.price_cents >= 20_000 || c.rarity === "legendary");
    return live.length > 0 ? live : DEMO_PREMIUM_AVATARS;
  }, [liveAvatars]);

  const basic = useMemo(() => {
    const live = liveAvatars.filter((c) => c.price_cents < 20_000 && c.rarity !== "legendary");
    return live.length > 0 ? live : DEMO_BASIC_AVATARS;
  }, [liveAvatars]);

  const shown = tier === "premium" ? premium : basic;
  const totalCents = cart.reduce((sum, c) => sum + c.price_cents, 0);

  const addToCart = (c: Cosmetic) => setCart((cur) => [...cur, c]);
  const removeAt = (i: number) => setCart((cur) => cur.filter((_, idx) => idx !== i));

  const checkout = async () => {
    if (cart.length === 0) return;
    await onCheckout(cart, pay);
    setCart([]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left — benefits banner, tier toggle, avatar grid */}
      <div className="space-y-5">
        <div className={cn(GLASS_PANEL, "flex items-center gap-3 border-[#f5c518]/25 px-5 py-3.5")}>
          <span className="text-lg">👑</span>
          <p className="text-sm text-neutral-200">
            <span className="font-display font-bold uppercase tracking-wide text-gold">
              Premium Account Benefits:
            </span>{" "}
            Ultra-Rare Drops, VIP Support, Priority Access.
          </p>
        </div>

        <div className={cn(GLASS_PANEL, "flex gap-1 p-1")}>
          {(["premium", "basic"] as Tier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wider transition",
                tier === t
                  ? t === "premium"
                    ? "bg-gold/15 text-gold"
                    : "bg-white/[0.06] text-white"
                  : "text-neutral-400 hover:text-white",
              )}
            >
              {t === "premium" ? "Premium Avatars" : "Basic Avatars"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const owned = ownedIds.has(c.id);
            const inCart = cart.filter((x) => x.id === c.id).length;
            const style = rarityStyle(c.rarity);
            return (
              <div
                key={c.id}
                className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "overflow-hidden", style.border)}
              >
                <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                <div className="space-y-1 p-3.5">
                  <p className="truncate text-sm font-bold text-white">{c.name}</p>
                  <p className="font-display text-sm font-bold text-gold">{fmtGold(c.price_cents)}</p>
                  <p className="text-[11px] text-neutral-400">{fmtEth(c.price_cents)}</p>
                  <div className="pt-1.5">
                    {owned ? (
                      <span className="inline-flex w-full items-center justify-center rounded-lg border border-[#22c55e]/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-green">
                        Owned
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToCart(c)}
                        className="w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/20"
                      >
                        {inCart > 0 ? `Purchase · ${inCart} queued` : "Purchase"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — Purchase Summary cart */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className={cn(GLASS_PANEL, "space-y-4 p-5")}>
          <h2 className={HEADING_LG}>Purchase Summary</h2>

          {cart.length === 0 ? (
            <p className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-6 text-center text-xs text-neutral-500">
              Queue avatars with Purchase to build your order.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {cart.map((c, i) => (
                <li
                  key={`${c.id}-${i}`}
                  className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/30 p-2"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{c.name}</p>
                    <p className="text-[10px] text-gold">{fmtGold(c.price_cents)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`Remove ${c.name}`}
                    className="shrink-0 rounded-md px-1.5 text-neutral-500 transition hover:text-[#ff9ba1]"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Total Cost</span>
            <span className="font-display text-sm font-bold text-gold">
              {goldOf(totalCents).toLocaleString()} Gold
            </span>
          </div>

          <div className="space-y-2">
            {(["gold", "eth"] as Pay[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPay(m)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition",
                  pay === m
                    ? "border-gold/40 bg-gold/10 text-white"
                    : "border-white/[0.08] text-neutral-300 hover:border-white/20",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded-full border",
                    pay === m ? "border-gold" : "border-white/30",
                  )}
                >
                  {pay === m && <span className="h-2 w-2 rounded-full bg-gold" />}
                </span>
                <span>{m === "gold" ? "🪙 Pay with Gold" : "◆ Pay with ETH"}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || busy !== null}
            onClick={() => void checkout()}
            className={cn(
              BTN_GOLD,
              "w-full rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide disabled:opacity-40",
            )}
          >
            {busy === "cart" ? "Processing…" : "Complete Purchase"}
          </button>

          <a
            href="/membership"
            className="block rounded-xl border border-white/15 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-neutral-300 transition hover:border-gold/40 hover:text-gold"
          >
            Account Upgrade Options
          </a>
        </div>
      </aside>
    </div>
  );
}

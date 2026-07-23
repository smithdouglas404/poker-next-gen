"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc, ensureNakamaSession } from "@/lib/nakama/sessionRpc";
import { Button, Panel } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_LG, cn } from "@/features/ui/tokens";
import { CosmeticThumb } from "@/features/marketplace/CosmeticThumb";
import { rarityStyle } from "@/features/marketplace/rarity";
import type { Cosmetic, Equipped } from "@/features/marketplace/types";
import {
  cartFromCatalog,
  cartTotals,
  DEMO_CART,
  formatPrice,
} from "@/features/marketplace/checkout/cart";
import { PurchaseSuccessModal } from "@/features/marketplace/checkout/PurchaseSuccessModal";
import type { CartItem, PurchaseLineResult } from "@/features/marketplace/checkout/types";

async function rpc<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

// Purchases settle in the platform wallet (USD). The displayed price is the exact
// amount charged (the cosmetic's real price_cents) — no separate Gold/ETH rail.

export default function CheckoutPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PurchaseLineResult[] | null>(null);
  const [success, setSuccess] = useState(false);

  // ---- Load a cart from the live catalog (falls back to the demo cart) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureNakamaSession();
        const [cat, inv] = await Promise.all([
          rpc<{ cosmetics?: Cosmetic[] }>("cosmetic_list", {}),
          rpc<{ inventory?: Cosmetic[]; equipped?: Equipped }>("inventory_list", {}).catch(
            () => ({ inventory: [] as Cosmetic[] }),
          ),
        ]);
        if (cancelled) return;
        const owned = new Set((inv.inventory ?? []).map((c) => c.id));
        const built = cartFromCatalog(cat.cosmetics ?? [], owned);
        setCart(built);
        setDemoMode(built === DEMO_CART || (cat.cosmetics ?? []).length === 0);
      } catch {
        if (cancelled) return;
        setCart(DEMO_CART);
        setDemoMode(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => cartTotals(cart), [cart]);

  const removeLine = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const completePurchase = useCallback(async () => {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);

    // Offline / demo cart: settle visually without hitting the network.
    if (demoMode) {
      setResults(cart.map((item) => ({ item, ok: true })));
      setSuccess(true);
      setBusy(false);
      return;
    }

    const out: PurchaseLineResult[] = [];
    for (const item of cart) {
      try {
        if (item.source === "market" && item.listingId) {
          await rpc("marketplace_buy", { listing_id: item.listingId });
        } else if (item.cosmeticId) {
          await rpc("cosmetic_buy", { cosmetic_id: item.cosmeticId });
        } else {
          throw new Error("missing item reference");
        }
        out.push({ item, ok: true });
      } catch (e) {
        out.push({ item, ok: false, error: e instanceof Error ? e.message : "Purchase failed" });
      }
    }

    setResults(out);
    setBusy(false);

    if (out.some((r) => r.ok)) {
      setSuccess(true);
    } else {
      setError(out[0]?.error ?? "Purchase failed — please try again.");
    }
  }, [cart, demoMode]);

  const settled = results?.filter((r) => r.ok).map((r) => r.item) ?? cart;
  const settledTotal = useMemo(() => cartTotals(settled).cents, [settled]);

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Avatar Marketplace and Tiers
            </p>
            <h1 className="mt-1 bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text font-display text-4xl font-bold uppercase tracking-wide text-transparent">
              Checkout
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Review your cart and complete your purchase.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/marketplace" className="text-muted hover:text-foreground hover:underline">
              ← Back to Market
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.6fr_1fr]">
        {/* ---- Order review ---- */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className={HEADING_LG}>Your Cart</h2>
            <span className="text-xs text-neutral-500">
              {totals.count} item{totals.count === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <Panel className="p-10 text-center text-sm text-neutral-500">Loading your cart…</Panel>
          ) : cart.length === 0 ? (
            <Panel className="space-y-4 p-10 text-center text-sm text-neutral-500">
              <p>Your cart is empty.</p>
              <Link
                href="/marketplace"
                className={cn(BTN_GOLD, "inline-block rounded-xl px-5 py-2.5 text-sm uppercase tracking-wide")}
              >
                Browse the Shop
              </Link>
            </Panel>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => {
                const style = rarityStyle(item.rarity);
                return (
                  <div
                    key={item.id}
                    className={cn(GLASS_PANEL, "flex items-center gap-4 overflow-hidden p-3")}
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                      <CosmeticThumb preview={item.preview} kind={item.kind} rarity={item.rarity} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-[0.18em]",
                          style.text,
                        )}
                      >
                        {item.kind ? `${item.kind.replace(/_/g, " ")} · ` : ""}
                        {item.rarity}
                        {item.qty > 1 ? ` · ×${item.qty}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-sm font-bold text-gold">
                        {formatPrice(item.priceCents * item.qty)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(item.id)}
                      disabled={busy}
                      aria-label={`Remove ${item.name}`}
                      className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-xs text-neutral-500 transition hover:border-[#e01e2b]/40 hover:text-[#ff9ba1] disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {demoMode && !loading && cart.length > 0 && (
            <p className="text-[11px] text-neutral-600">
              Offline demo cart — purchases settle locally. Connect to settle through the live buy RPC.
            </p>
          )}
        </section>

        {/* ---- Purchase summary ---- */}
        <aside>
          <div className={cn(GLASS_PANEL, "sticky top-6 space-y-5 p-6")}>
            <h2 className="font-display text-lg font-bold uppercase tracking-wider">
              Purchase Summary
            </h2>

            <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                    <CosmeticThumb preview={item.preview} kind={item.kind} rarity={item.rarity} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{item.name}</p>
                    <p className="text-[11px] text-gold">{formatPrice(item.priceCents)}</p>
                  </div>
                </div>
              ))}
              {cart.length === 0 && !loading && (
                <p className="text-xs text-neutral-600">No items in cart.</p>
              )}
            </div>

            <div className="space-y-2 border-t border-white/[0.06] pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-400">Total Cost</span>
                <span className="font-display text-xl font-bold text-gold">
                  {formatPrice(totals.cents)}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Charged to your wallet balance. Add funds in the Cashier if your balance is low.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-[#e01e2b]/30 bg-[#e01e2b]/10 p-3 text-xs text-[#ff9ba1]">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={busy || cart.length === 0 || loading}
              onClick={completePurchase}
              className={cn(
                BTN_GOLD,
                "w-full rounded-xl px-6 py-3 text-sm uppercase tracking-[0.18em] disabled:opacity-40",
              )}
            >
              {busy ? "Processing…" : "Complete Purchase"}
            </button>

            <Link href="/membership" className="block">
              <Button variant="outline" size="sm" className="w-full">
                Account Upgrade Options
              </Button>
            </Link>
          </div>
        </aside>
      </main>

      {success && (
        <PurchaseSuccessModal
          items={settled}
          totalCents={settledTotal}
          onWardrobe={() => router.push("/marketplace?tab=vault")}
          onBackToMarket={() => router.push("/marketplace")}
        />
      )}
    </div>
  );
}

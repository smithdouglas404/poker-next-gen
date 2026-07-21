"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Input, Panel, SectionHeader } from "@/features/ui";

interface Listing {
  id: string;
  seller_user_id: string;
  cosmetic_id: string;
  price_cents: number;
  name: string;
  kind: string;
  rarity: string;
  preview_ref: string;
}

interface Cosmetic {
  id: string;
  kind: string;
  name: string;
  rarity: string;
  preview_ref: string;
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [inventory, setInventory] = useState<Cosmetic[]>([]);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, inv] = await Promise.all([
        callSessionRpc("marketplace_browse", {}),
        callSessionRpc("inventory_list", {}),
      ]);
      setListings((b as { listings?: Listing[] }).listings ?? []);
      setInventory((inv as { inventory?: Cosmetic[] }).inventory ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load marketplace");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setMessage(null);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <SectionHeader>Marketplace</SectionHeader>
            <h1 className="font-display mt-1 text-3xl font-bold">Character Marketplace</h1>
          </div>
          <div className="flex gap-4 text-sm">
            <Link href="/studio" className="text-fuchsia-300 hover:underline">Studio</Link>
            <Link href="/hub" className="text-cyan hover:underline">← Command Center</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-200">{message}</div>}

        <section>
          <h2 className="font-display mb-3 text-lg font-bold">For sale</h2>
          {listings.length === 0 ? (
            <Panel className="p-8 text-center text-sm text-neutral-500">No listings yet.</Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {listings.map((l) => (
                <Panel key={l.id} className="overflow-hidden" hover>
                  <div className="aspect-square w-full bg-black/40">
                    {l.preview_ref ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.preview_ref} alt={l.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🎭</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-amber-300/70">{l.kind} · {l.rarity}</p>
                    <p className="mt-1 text-sm font-bold text-amber-200">${(l.price_cents / 100).toFixed(2)}</p>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        act("buy" + l.id, async () => {
                          await callSessionRpc("marketplace_buy", { listing_id: l.id });
                          setMessage("Purchased! It's in your inventory.");
                          await load();
                        })
                      }
                      className="mt-2 w-full"
                    >
                      Buy
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display mb-1 text-lg font-bold">Sell from your collection</h2>
          <p className="mb-3 text-xs text-neutral-500">
            List an owned character or item. The platform fee (your tier&rsquo;s marketplace rate)
            is deducted from the sale; the rest goes to your wallet.
          </p>
          {inventory.length === 0 ? (
            <Panel className="p-8 text-center text-sm text-neutral-500">
              Nothing to sell — generate a character in the Studio.
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {inventory.map((c) => (
                <Panel key={c.id} className="overflow-hidden">
                  <div className="aspect-square w-full bg-black/40">
                    {c.preview_ref ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.preview_ref} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🎭</div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1">
                      <span className="text-neutral-500">$</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={price[c.id] ?? "10"}
                        onChange={(e) => setPrice((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="border-0 bg-transparent px-1 py-0.5 text-xs focus:ring-0"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        act("list" + c.id, async () => {
                          const cents = Math.round(parseFloat(price[c.id] ?? "10") * 100);
                          await callSessionRpc("marketplace_list", { cosmetic_id: c.id, price_cents: cents });
                          setMessage("Listed for sale.");
                          await load();
                        })
                      }
                      className="w-full"
                    >
                      List for sale
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

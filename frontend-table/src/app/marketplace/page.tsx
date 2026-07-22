"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc, ensureNakamaSession } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Panel, Select } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_LG, cn } from "@/features/ui/tokens";
import { CosmeticThumb } from "@/features/marketplace/CosmeticThumb";
import { rarityKey, rarityStyle, usd } from "@/features/marketplace/rarity";
import { AvatarTiers } from "@/features/marketplace/AvatarTiers";
import { PremiumMarket } from "@/features/marketplace/PremiumMarket";
import { isDemoCosmeticId } from "@/features/marketplace/avatars";
import type {
  Cosmetic,
  Equipped,
  Listing,
  Loadout,
  NFTStatus,
} from "@/features/marketplace/types";

type Tab = "market" | "shop" | "tiers" | "premium" | "vault";

async function rpc<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "market", label: "Marketplace", blurb: "Player-to-player trading floor" },
  { id: "shop", label: "Shop", blurb: "Official cosmetics catalog" },
  { id: "tiers", label: "Avatars & Tiers", blurb: "Premium & basic avatar drops" },
  { id: "premium", label: "Premium", blurb: "Mythic & 1/1 exclusives" },
  { id: "vault", label: "Vault", blurb: "Your collection · dye · loadouts" },
];

export default function MarketplacePage() {
  const [tab, setTab] = useState<Tab>("market");

  // Honor a deep-link tab (e.g. checkout's "View in Wardrobe" → ?tab=vault).
  // Read from window in an effect to avoid the useSearchParams SSR-bailout.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "market" || t === "shop" || t === "tiers" || t === "premium" || t === "vault") {
      setTab(t);
    }
  }, []);

  // Data
  const [myUserId, setMyUserId] = useState<string>("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [inventory, setInventory] = useState<Cosmetic[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [catalog, setCatalog] = useState<Cosmetic[]>([]);
  const [wishlist, setWishlist] = useState<Cosmetic[]>([]);
  const [loadouts, setLoadouts] = useState<Loadout[]>([]);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [shopKind, setShopKind] = useState<string>("all");
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [nft, setNft] = useState<Record<string, NFTStatus>>({});
  const [dye, setDye] = useState({ primary: "#e01e2b", secondary: "#f5c518", accent: "#22c55e" });
  const [loadoutName, setLoadoutName] = useState("");

  const ownedIds = useMemo(() => new Set(inventory.map((c) => c.id)), [inventory]);
  const wishlistIds = useMemo(() => new Set(wishlist.map((c) => c.id)), [wishlist]);
  const equippedIds = useMemo(() => new Set(Object.values(equipped)), [equipped]);

  const loadMarket = useCallback(async () => {
    const b = await rpc<{ listings?: Listing[] }>("marketplace_browse", {});
    setListings(b.listings ?? []);
  }, []);

  const loadInventory = useCallback(async () => {
    const inv = await rpc<{ inventory?: Cosmetic[]; equipped?: Equipped }>("inventory_list", {});
    setInventory(inv.inventory ?? []);
    setEquipped(inv.equipped ?? {});
  }, []);

  const loadShop = useCallback(async () => {
    const [c, w] = await Promise.all([
      rpc<{ cosmetics?: Cosmetic[] }>("cosmetic_list", {}),
      rpc<{ wishlist?: Cosmetic[] }>("cosmetic_wishlist_list", {}),
    ]);
    setCatalog(c.cosmetics ?? []);
    setWishlist(w.wishlist ?? []);
  }, []);

  const loadLoadouts = useCallback(async () => {
    const l = await rpc<{ loadouts?: Loadout[] }>("loadout_list", {});
    setLoadouts(l.loadouts ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const session = await ensureNakamaSession();
      setMyUserId(session.user_id ?? "");
      await Promise.all([loadMarket(), loadInventory(), loadShop(), loadLoadouts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the vault");
    }
  }, [loadMarket, loadInventory, loadShop, loadLoadouts]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const act = useCallback(async (key: string, fn: () => Promise<void>) => {
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
  }, []);

  // ---- Actions (every one hits a real registered RPC) ----

  const buyListing = (l: Listing) =>
    act("buy" + l.id, async () => {
      const r = await rpc<{ paid_cents?: number }>("marketplace_buy", { listing_id: l.id });
      setMessage(`Bought "${l.name ?? "item"}" for ${usd(r.paid_cents ?? l.price_cents)} — now in your Vault.`);
      await Promise.all([loadMarket(), loadInventory()]);
    });

  const cancelListing = (l: Listing) =>
    act("cancel" + l.id, async () => {
      await rpc("marketplace_cancel", { listing_id: l.id });
      setMessage("Listing withdrawn.");
      await loadMarket();
    });

  const listForSale = (c: Cosmetic) =>
    act("list" + c.id, async () => {
      const cents = Math.max(1, Math.round(parseFloat(price[c.id] ?? "10") * 100));
      await rpc("marketplace_list", { cosmetic_id: c.id, price_cents: cents });
      setMessage(`Listed "${c.name}" for ${usd(cents)}.`);
      await loadMarket();
    });

  // Locally add a demo/offline avatar to the collection (labeled, never live).
  const simulateOwn = useCallback((items: Cosmetic[]) => {
    setInventory((inv) => {
      const have = new Set(inv.map((c) => c.id));
      const add = items.filter((c) => !have.has(c.id));
      return add.length ? [...add, ...inv] : inv;
    });
  }, []);

  const buyCosmetic = (c: Cosmetic) =>
    act("shopbuy" + c.id, async () => {
      if (isDemoCosmeticId(c.id)) {
        simulateOwn([c]);
        setMessage(`Acquired "${c.name}" (offline demo — not a live purchase).`);
        return;
      }
      await rpc("cosmetic_buy", { cosmetic_id: c.id });
      setMessage(`Purchased "${c.name}".`);
      await loadInventory();
    });

  // Batch checkout for the Avatars & Tiers cart — each item settles through the
  // real `cosmetic_buy` RPC (demo items are simulated locally and labeled).
  const buyCart = (items: Cosmetic[]) =>
    act("cart", async () => {
      if (items.length === 0) return;
      const demo = items.filter((c) => isDemoCosmeticId(c.id));
      const live = items.filter((c) => !isDemoCosmeticId(c.id));
      for (const c of live) {
        await rpc("cosmetic_buy", { cosmetic_id: c.id });
      }
      if (demo.length) simulateOwn(demo);
      if (live.length) await loadInventory();
      const total = usd(items.reduce((s, c) => s + c.price_cents, 0));
      setMessage(
        `Purchase complete — ${items.length} avatar${items.length === 1 ? "" : "s"} for ${total}` +
          (demo.length ? ` (${demo.length} offline demo).` : "."),
      );
    });

  const equip = (c: Cosmetic) =>
    act("equip" + c.id, async () => {
      await rpc("cosmetic_equip", { cosmetic_id: c.id });
      setMessage(`Equipped "${c.name}".`);
      await loadInventory();
    });

  const toggleWishlist = (c: Cosmetic) =>
    act("wish" + c.id, async () => {
      if (wishlistIds.has(c.id)) {
        await rpc("cosmetic_wishlist_remove", { cosmetic_id: c.id });
      } else {
        await rpc("cosmetic_wishlist_add", { cosmetic_id: c.id });
      }
      await loadShop();
    });

  const saveDye = (c: Cosmetic) =>
    act("dye" + c.id, async () => {
      await rpc("cosmetic_dye_set", { cosmetic_id: c.id, params: dye });
      setMessage(`Dye saved for "${c.name}".`);
    });

  const mintNft = (c: Cosmetic) =>
    act("mint" + c.id, async () => {
      const r = await rpc<NFTStatus>("cosmetic_mint_nft", { cosmetic_id: c.id });
      setNft((m) => ({ ...m, [c.id]: r }));
      setMessage(
        r.configured
          ? `Mint ${r.status ?? "submitted"}${r.tx_hash ? ` · ${r.tx_hash.slice(0, 10)}…` : ""}`
          : r.message ?? "On-chain minting isn't configured yet.",
      );
    });

  const refreshNft = useCallback(async (c: Cosmetic) => {
    try {
      const r = await rpc<NFTStatus>("cosmetic_nft_status", { cosmetic_id: c.id });
      setNft((m) => ({ ...m, [c.id]: r }));
    } catch {
      /* status is best-effort */
    }
  }, []);

  const saveLoadout = () =>
    act("saveloadout", async () => {
      if (loadoutName.trim() === "") return;
      await rpc("loadout_save", { name: loadoutName.trim(), slots: equipped });
      setMessage(`Loadout "${loadoutName.trim()}" saved from your equipped set.`);
      setLoadoutName("");
      await loadLoadouts();
    });

  const equipLoadout = (l: Loadout) =>
    act("eqload" + l.id, async () => {
      const r = await rpc<{ equipped?: string[]; skipped?: string[] }>("loadout_equip", {
        loadout_id: l.id,
      });
      const eq = r.equipped?.length ?? 0;
      const sk = r.skipped?.length ?? 0;
      setMessage(`Loadout "${l.name}" equipped — ${eq} item${eq === 1 ? "" : "s"}${sk ? `, ${sk} skipped (not owned)` : ""}.`);
      await loadInventory();
    });

  const openVaultItem = (c: Cosmetic) => {
    setSelected(c);
    void refreshNft(c);
  };

  // ---- Render helpers ----

  const shopKinds = useMemo(() => {
    const set = new Set(catalog.map((c) => c.kind));
    return ["all", ...Array.from(set).sort()];
  }, [catalog]);

  const shownCatalog = useMemo(
    () => (shopKind === "all" ? catalog : catalog.filter((c) => c.kind === shopKind)),
    [catalog, shopKind],
  );

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
                Player Marketplace
              </p>
              <h1 className="mt-1 bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text font-display text-4xl font-bold uppercase tracking-wide text-transparent">
                The Vault
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                Trade, collect, and customize — every character, skin, and effect you own.
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/marketplace/checkout" className="text-gold hover:underline">
                Checkout
              </Link>
              <Link href="/studio" className="text-gold hover:underline">
                Studio
              </Link>
              <Link href="/hub" className="text-muted hover:text-foreground hover:underline">
                ← Command Center
              </Link>
            </div>
          </div>

          {/* Tab bar */}
          <div className={cn(GLASS_PANEL, "flex flex-wrap gap-1 p-1")}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-xl px-4 py-3 text-left transition",
                  tab === t.id
                    ? "bg-[#e01e2b]/12"
                    : "hover:bg-white/[0.03]",
                )}
              >
                <span
                  className={cn(
                    "font-display text-sm font-bold uppercase tracking-wider",
                    tab === t.id ? "text-[#ff2d3f]" : "text-neutral-300",
                  )}
                >
                  {t.label}
                </span>
                <span className="block text-[11px] text-neutral-500">{t.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/10 p-4 text-sm text-green">
            {message}
          </div>
        )}

        {tab === "market" && (
          <MarketTab
            listings={listings}
            inventory={inventory}
            myUserId={myUserId}
            busy={busy}
            price={price}
            setPrice={setPrice}
            onBuy={buyListing}
            onCancel={cancelListing}
            onList={listForSale}
          />
        )}

        {tab === "shop" && (
          <ShopTab
            items={shownCatalog}
            kinds={shopKinds}
            kind={shopKind}
            setKind={setShopKind}
            ownedIds={ownedIds}
            equippedIds={equippedIds}
            wishlistIds={wishlistIds}
            wishlistCount={wishlist.length}
            busy={busy}
            onBuy={buyCosmetic}
            onEquip={equip}
            onWishlist={toggleWishlist}
          />
        )}

        {tab === "tiers" && (
          <AvatarTiers
            catalog={catalog}
            ownedIds={ownedIds}
            busy={busy}
            onCheckout={buyCart}
          />
        )}

        {tab === "premium" && (
          <PremiumMarket
            catalog={catalog}
            ownedIds={ownedIds}
            wishlistIds={wishlistIds}
            busy={busy}
            onBuy={buyCosmetic}
            onWishlist={toggleWishlist}
          />
        )}

        {tab === "vault" && (
          <VaultTab
            inventory={inventory}
            equippedIds={equippedIds}
            loadouts={loadouts}
            selected={selected}
            nft={nft}
            dye={dye}
            setDye={setDye}
            loadoutName={loadoutName}
            setLoadoutName={setLoadoutName}
            busy={busy}
            onOpen={openVaultItem}
            onEquip={equip}
            onDye={saveDye}
            onMint={mintNft}
            onSaveLoadout={saveLoadout}
            onEquipLoadout={equipLoadout}
          />
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ Rarity tag

function RarityTag({ rarity, kind }: { rarity?: string; kind?: string }) {
  const style = rarityStyle(rarity);
  const key = rarityKey(rarity);
  return (
    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.18em]", style.text)}>
      {kind ? `${kind.replace(/_/g, " ")} · ` : ""}
      {key}
    </p>
  );
}

// ------------------------------------------------------------------ Market tab

function MarketTab({
  listings,
  inventory,
  myUserId,
  busy,
  price,
  setPrice,
  onBuy,
  onCancel,
  onList,
}: {
  listings: Listing[];
  inventory: Cosmetic[];
  myUserId: string;
  busy: string | null;
  price: Record<string, string>;
  setPrice: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onBuy: (l: Listing) => void;
  onCancel: (l: Listing) => void;
  onList: (c: Cosmetic) => void;
}) {
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className={HEADING_LG}>Trading Floor</h2>
          <span className="text-xs text-neutral-500">{listings.length} open listing{listings.length === 1 ? "" : "s"}</span>
        </div>
        {listings.length === 0 ? (
          <Panel className="p-10 text-center text-sm text-neutral-500">
            No open listings right now. List an item below to seed the floor.
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((l) => {
              const mine = l.seller_user_id === myUserId && myUserId !== "";
              return (
                <div key={l.id} className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "overflow-hidden")}>
                  <CosmeticThumb preview={l.preview_ref} kind={l.kind} rarity={l.rarity} />
                  <div className="space-y-2 p-4">
                    <p className="truncate text-sm font-semibold">{l.name ?? "Cosmetic"}</p>
                    <RarityTag rarity={l.rarity} kind={l.kind} />
                    <p className="pt-1 font-display text-lg font-bold text-gold">
                      {usd(l.price_cents)}
                    </p>
                    {mine ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy !== null}
                        onClick={() => onCancel(l)}
                        className="w-full"
                      >
                        {busy === "cancel" + l.id ? "Withdrawing…" : "Cancel listing"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => onBuy(l)}
                        className="w-full"
                      >
                        {busy === "buy" + l.id ? "Buying…" : "Buy now"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className={HEADING_LG}>Sell From Your Collection</h2>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          List an owned item. The platform fee (your tier&rsquo;s marketplace rate) is deducted at
          sale; the remainder credits your wallet. Selling requires biometric verification.
        </p>
        {inventory.length === 0 ? (
          <Panel className="p-10 text-center text-sm text-neutral-500">
            Nothing to sell yet — buy from the Shop or generate a character in the Studio.
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inventory.map((c) => (
              <div key={c.id} className={cn(GLASS_PANEL, "overflow-hidden")}>
                <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <RarityTag rarity={c.rarity} kind={c.kind} />
                  <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
                    <span className="text-neutral-500">$</span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={price[c.id] ?? "10"}
                      onChange={(e) => setPrice((p) => ({ ...p, [c.id]: e.target.value }))}
                      className="border-0 bg-transparent px-1 py-0.5 text-sm focus:ring-0"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onList(c)}
                    className="w-full"
                  >
                    {busy === "list" + c.id ? "Listing…" : "List for sale"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// -------------------------------------------------------------------- Shop tab

function ShopTab({
  items,
  kinds,
  kind,
  setKind,
  ownedIds,
  equippedIds,
  wishlistIds,
  wishlistCount,
  busy,
  onBuy,
  onEquip,
  onWishlist,
}: {
  items: Cosmetic[];
  kinds: string[];
  kind: string;
  setKind: (k: string) => void;
  ownedIds: Set<string>;
  equippedIds: Set<string>;
  wishlistIds: Set<string>;
  wishlistCount: number;
  busy: string | null;
  onBuy: (c: Cosmetic) => void;
  onEquip: (c: Cosmetic) => void;
  onWishlist: (c: Cosmetic) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className={HEADING_LG}>Cosmetics Shop</h2>
          <span className="text-xs text-neutral-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-3">
          {wishlistCount > 0 && (
            <span className="text-xs text-gold">★ {wishlistCount} wishlisted</span>
          )}
          <div className="w-44">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k === "all" ? "All categories" : k.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-neutral-500">
          The catalog is empty for this category.
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((c) => {
            const owned = ownedIds.has(c.id);
            const isEquipped = equippedIds.has(c.id);
            const wished = wishlistIds.has(c.id);
            return (
              <div key={c.id} className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "relative overflow-hidden")}>
                <button
                  type="button"
                  onClick={() => onWishlist(c)}
                  disabled={busy !== null}
                  aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                  className={cn(
                    "absolute right-2 top-2 z-10 rounded-full border px-2 py-1 text-sm backdrop-blur-md transition",
                    wished
                      ? "border-gold/50 bg-black/50 text-gold"
                      : "border-white/15 bg-black/40 text-neutral-400 hover:text-gold",
                  )}
                >
                  {wished ? "★" : "☆"}
                </button>
                <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <RarityTag rarity={c.rarity} kind={c.kind} />
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-display text-lg font-bold text-gold">
                      {c.price_cents > 0 ? usd(c.price_cents) : "Free"}
                    </span>
                    {owned && (
                      <span className="rounded-full border border-[#22c55e]/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green">
                        Owned
                      </span>
                    )}
                  </div>
                  {owned ? (
                    <Button
                      size="sm"
                      variant={isEquipped ? "ghost" : "outline"}
                      disabled={busy !== null || isEquipped}
                      onClick={() => onEquip(c)}
                      className="w-full"
                    >
                      {isEquipped ? "Equipped" : busy === "equip" + c.id ? "Equipping…" : "Equip"}
                    </Button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onBuy(c)}
                      className={cn(
                        BTN_GOLD,
                        "w-full rounded-xl px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-40",
                      )}
                    >
                      {busy === "shopbuy" + c.id ? "Buying…" : "Buy"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Vault tab

function VaultTab({
  inventory,
  equippedIds,
  loadouts,
  selected,
  nft,
  dye,
  setDye,
  loadoutName,
  setLoadoutName,
  busy,
  onOpen,
  onEquip,
  onDye,
  onMint,
  onSaveLoadout,
  onEquipLoadout,
}: {
  inventory: Cosmetic[];
  equippedIds: Set<string>;
  loadouts: Loadout[];
  selected: Cosmetic | null;
  nft: Record<string, NFTStatus>;
  dye: { primary: string; secondary: string; accent: string };
  setDye: React.Dispatch<React.SetStateAction<{ primary: string; secondary: string; accent: string }>>;
  loadoutName: string;
  setLoadoutName: (v: string) => void;
  busy: string | null;
  onOpen: (c: Cosmetic) => void;
  onEquip: (c: Cosmetic) => void;
  onDye: (c: Cosmetic) => void;
  onMint: (c: Cosmetic) => void;
  onSaveLoadout: () => void;
  onEquipLoadout: (l: Loadout) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      {/* Collection grid */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className={HEADING_LG}>Your Collection</h2>
          <span className="text-xs text-neutral-500">
            {inventory.length} owned · {equippedIds.size} equipped
          </span>
        </div>
        {inventory.length === 0 ? (
          <Panel className="p-10 text-center text-sm text-neutral-500">
            Your vault is empty. Buy cosmetics in the Shop or win them at the table.
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {inventory.map((c) => {
              const isEquipped = equippedIds.has(c.id);
              const active = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpen(c)}
                  className={cn(
                    GLASS_PANEL,
                    "overflow-hidden text-left transition",
                    active
                      ? "border-gold/50 shadow-[0_0_24px_rgba(212,175,55,0.18)]"
                      : "hover:border-white/20",
                  )}
                >
                  <div className="relative">
                    <CosmeticThumb preview={c.preview_ref} kind={c.kind} rarity={c.rarity} />
                    {isEquipped && (
                      <span className="absolute left-2 top-2 rounded-full border border-[#f5c518]/40 bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                        Equipped
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <RarityTag rarity={c.rarity} kind={c.kind} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Loadouts */}
        <Panel className="space-y-3 p-5">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
            Loadouts
          </h3>
          <p className="text-xs text-neutral-500">
            Save your equipped set as a named outfit and re-equip it in one tap.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Loadout name (e.g. High Roller)"
              value={loadoutName}
              onChange={(e) => setLoadoutName(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy !== null || loadoutName.trim() === ""}
              onClick={onSaveLoadout}
              className="shrink-0"
            >
              {busy === "saveloadout" ? "Saving…" : "Save"}
            </Button>
          </div>
          {loadouts.length === 0 ? (
            <p className="text-xs text-neutral-600">No saved loadouts yet.</p>
          ) : (
            <ul className="space-y-2">
              {loadouts.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <span className="text-sm font-semibold">{l.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onEquipLoadout(l)}
                  >
                    {busy === "eqload" + l.id ? "Equipping…" : "Equip"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Detail / customization drawer */}
      <section>
        {selected ? (
          <Panel className="sticky top-6 space-y-5 p-6">
            <CosmeticThumb
              preview={selected.preview_ref}
              kind={selected.kind}
              rarity={selected.rarity}
              className="rounded-xl"
            />
            <div>
              <h3 className="font-display text-xl font-bold">{selected.name}</h3>
              <RarityTag rarity={selected.rarity} kind={selected.kind} />
            </div>

            <Button
              disabled={busy !== null || equippedIds.has(selected.id)}
              onClick={() => onEquip(selected)}
              className="w-full"
            >
              {equippedIds.has(selected.id)
                ? "Equipped"
                : busy === "equip" + selected.id
                  ? "Equipping…"
                  : "Equip"}
            </Button>

            {/* Dye studio */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted">
                Dye Studio
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {(["primary", "secondary", "accent"] as const).map((slot) => (
                  <Field key={slot} label={slot}>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={dye[slot]}
                        onChange={(e) => setDye((d) => ({ ...d, [slot]: e.target.value }))}
                        className="h-9 w-9 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                      />
                      <span className="font-mono text-[10px] text-neutral-500">{dye[slot]}</span>
                    </div>
                  </Field>
                ))}
              </div>
              <div className="flex gap-2">
                {(["primary", "secondary", "accent"] as const).map((slot) => (
                  <div
                    key={slot}
                    className="h-6 flex-1 rounded-md"
                    style={{ background: dye[slot], boxShadow: `0 0 14px ${dye[slot]}55` }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => onDye(selected)}
                className="w-full"
              >
                {busy === "dye" + selected.id ? "Saving dye…" : "Save dye"}
              </Button>
            </div>

            {/* NFT mint */}
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-4">
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gold/80">
                Mint as NFT
              </h4>
              <NftBlock status={nft[selected.id]} />
              <button
                type="button"
                disabled={busy !== null || nft[selected.id]?.configured === false}
                onClick={() => onMint(selected)}
                className={cn(
                  BTN_GOLD,
                  "w-full rounded-xl px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-40",
                )}
              >
                {nft[selected.id]?.configured === false
                  ? "Coming soon"
                  : nft[selected.id]?.status === "minted"
                    ? "Minted ✓"
                    : busy === "mint" + selected.id
                      ? "Minting…"
                      : "Mint to chain"}
              </button>
            </div>
          </Panel>
        ) : (
          <Panel className="flex h-64 items-center justify-center p-10 text-center text-sm text-neutral-500">
            Select an item from your collection to equip, dye, or mint it.
          </Panel>
        )}
      </section>
    </div>
  );
}

function NftBlock({ status }: { status?: NFTStatus }) {
  if (!status) {
    return <p className="text-xs text-neutral-500">Immortalize this cosmetic on-chain.</p>;
  }
  if (status.configured === false) {
    return (
      <p className="text-xs text-neutral-500">
        {status.message ?? "On-chain minting isn't configured on this network yet."}
      </p>
    );
  }
  if (status.status === "none") {
    return <p className="text-xs text-neutral-500">Not yet minted.</p>;
  }
  return (
    <div className="space-y-1 text-xs">
      <p className="text-neutral-400">
        Status: <span className="text-gold">{status.status}</span>
        {status.chain ? ` · ${status.chain}` : ""}
      </p>
      {status.tx_hash && (
        <p className="truncate font-mono text-[10px] text-neutral-600">tx {status.tx_hash}</p>
      )}
    </div>
  );
}

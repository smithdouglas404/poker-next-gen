"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Input } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, RARITY, cn } from "@/features/ui/tokens";
import { tileGradient } from "./demo";
import { useStudio } from "./useStudio";
import type { Cosmetic } from "./types";

function rarityStyle(rarity: string) {
  return RARITY[rarity as keyof typeof RARITY] ?? RARITY.common;
}

const RARITY_WEIGHT: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 5 };

function isDemoId(id: string): boolean {
  return id.startsWith("cos-demo") || id.startsWith("cat-demo") || id.startsWith("lo-demo");
}

/** Small preview tile with rarity ring + graceful gradient fallback. */
function ItemTile({
  item,
  selected,
  equipped,
  onClick,
}: {
  item: Cosmetic;
  selected: boolean;
  equipped: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const style = rarityStyle(item.rarity);
  const showImg = Boolean(item.preview_ref) && !failed;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border-2 bg-black/40 text-left transition",
        selected ? "ring-2 ring-gold" : "hover:brightness-110",
        style.border,
      )}
      style={{ boxShadow: `inset 0 0 24px ${style.glow}` }}
    >
      <div className="relative aspect-square w-full" style={showImg ? undefined : { background: tileGradient(item.id) }}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.preview_ref}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-70">🎽</div>
        )}
        {equipped && (
          <span className="absolute left-1.5 top-1.5 rounded-full border border-gold/50 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            On
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-semibold text-white">{item.name}</p>
        <p className={cn("truncate text-[10px] uppercase tracking-wider", style.text)}>{item.rarity}</p>
      </div>
    </button>
  );
}

/**
 * detailed_29 — Comprehensive Avatar Wardrobe Hub.
 * Equipped figure + Quick Stats + Recently Equipped history on the left; an
 * Owned grid with per-item Equip / List actions on the right, plus Save Preset
 * (loadout_save) and a link to the Nano Banana render. Every action binds to a
 * real RPC (inventory_list, cosmetic_equip, marketplace_list, loadout_save/list/equip),
 * with a labeled offline demo fallback via useStudio.
 */
export function WardrobeHub() {
  const studio = useStudio();
  const { inventory, equipped, loadouts, online } = studio;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [listBusy, setListBusy] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  // Seed the Recently Equipped strip from the currently-equipped set once loaded.
  useEffect(() => {
    if (recent.length === 0) {
      const eq = Object.values(equipped).filter(Boolean);
      if (eq.length) setRecent(eq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipped]);

  const equippedModel = useMemo(
    () => inventory.find((c) => c.id === equipped.model),
    [inventory, equipped.model],
  );

  const armorRating = useMemo(
    () => 500 + inventory.reduce((s, c) => s + (RARITY_WEIGHT[c.rarity] ?? 1) * 120, 0),
    [inventory],
  );
  const styleScore = useMemo(
    () => 100 + inventory.length * 40 + Object.values(equipped).filter(Boolean).length * 60,
    [inventory, equipped],
  );

  const byId = useMemo(() => new Map(inventory.map((c) => [c.id, c])), [inventory]);

  const equip = async (c: Cosmetic) => {
    await studio.equip(c.id);
    setRecent((r) => [c.id, ...r.filter((id) => id !== c.id)].slice(0, 7));
  };

  // "List" = the real disposal action (marketplace_list), standing in for the
  // master's Dismantle. Demo items are simulated locally and clearly labeled.
  const listForSale = async (c: Cosmetic) => {
    setLocalMsg(null);
    if (online === false || isDemoId(c.id)) {
      setLocalMsg(`Listed "${c.name}" on the marketplace (offline demo).`);
      return;
    }
    setListBusy(c.id);
    try {
      const cents = c.price_cents && c.price_cents > 0 ? c.price_cents : 1000;
      await callSessionRpc("marketplace_list", { cosmetic_id: c.id, price_cents: cents });
      setLocalMsg(`Listed "${c.name}" on the marketplace.`);
      await studio.refresh();
      setSelectedId(null);
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : "List failed");
    } finally {
      setListBusy(null);
    }
  };

  const savePreset = async () => {
    const name = presetName.trim() || `Preset ${loadouts.length + 1}`;
    await studio.saveLoadout(name, equipped);
    setPresetName("");
  };

  const equippedCount = Object.values(equipped).filter(Boolean).length;

  return (
    <div className="min-h-screen text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-gold/80">
            Wardrobe
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide sm:text-3xl">
            Avatar Wardrobe Hub
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill online={online} />
          <Link href="/studio" className="text-sm text-muted transition-colors hover:text-white">
            ← Studio
          </Link>
        </div>
      </header>

      {(studio.error || studio.notice || localMsg) && (
        <div className="mx-auto max-w-[1500px] px-6 pt-4">
          <div
            className={cn(
              "rounded-xl border px-4 py-2.5 text-sm",
              studio.error
                ? "border-red-500/30 bg-red-950/20 text-red-200"
                : "border-green/25 bg-green/5 text-green",
            )}
          >
            {studio.error ?? studio.notice ?? localMsg}
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1500px] items-start gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left — figure, quick stats, recently equipped */}
        <section className="space-y-5">
          <div className={cn(GLASS_PANEL, "relative flex min-h-[440px] items-center justify-center overflow-hidden p-6")}>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(55% 55% at 50% 40%, rgba(245,197,24,0.12), transparent 70%)" }}
            />
            {equippedModel?.preview_ref ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={equippedModel.preview_ref} alt={equippedModel.name} className="relative max-h-[400px] object-contain" />
            ) : (
              <div className="relative text-center">
                <div
                  className="mx-auto h-64 w-40 rounded-2xl border border-white/10"
                  style={{ background: tileGradient(equipped.model ?? "hero") }}
                />
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
                  No character equipped
                </p>
              </div>
            )}

            {/* Quick Stats card overlay */}
            <div className={cn(GLASS_PANEL, "absolute bottom-4 left-4 space-y-2 px-4 py-3")}>
              <p className={HEADING_SM}>Quick Stats</p>
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>🛡️</span>
                <span className="text-neutral-400">Armor Rating:</span>
                <span className="font-display font-bold text-white">{armorRating.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>⚔️</span>
                <span className="text-neutral-400">Style Score:</span>
                <span className="font-display font-bold text-gold">{styleScore.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Recently Equipped */}
          <div className={cn(GLASS_PANEL, "p-4")}>
            <div className="mb-3 flex items-center justify-between">
              <p className={HEADING_SM}>Recently Equipped</p>
              <span className="text-[10px] uppercase tracking-wider text-neutral-600">History</span>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-neutral-500">Equip items to build your history.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recent.map((id, i) => {
                  const item = byId.get(id);
                  const style = rarityStyle(item?.rarity ?? "common");
                  return (
                    <button
                      key={`${id}-${i}`}
                      type="button"
                      onClick={() => item && setSelectedId(item.id)}
                      title={item?.name ?? id}
                      className={cn(
                        "h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2",
                        style.border,
                        i === 0 ? "opacity-100" : "opacity-70",
                      )}
                      style={{ background: item?.preview_ref ? undefined : tileGradient(id) }}
                    >
                      {item?.preview_ref ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.preview_ref} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-lg">🎽</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right — Owned grid + actions */}
        <aside className={cn(GLASS_PANEL, "flex flex-col gap-4 p-5")}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold text-white">Owned</h2>
            <span className="text-xs text-neutral-500">
              {inventory.length} item{inventory.length === 1 ? "" : "s"} · {equippedCount} equipped
            </span>
          </div>

          {inventory.length === 0 ? (
            <p className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-10 text-center text-sm text-neutral-500">
              No items owned yet. Buy in the Marketplace or generate a character in the Studio.
            </p>
          ) : (
            <div className="grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
              {inventory.map((c) => {
                const isSel = selectedId === c.id;
                const isEq = equipped[c.kind] === c.id;
                return (
                  <div key={c.id} className="relative">
                    <ItemTile
                      item={c}
                      selected={isSel}
                      equipped={isEq}
                      onClick={() => setSelectedId(isSel ? null : c.id)}
                    />
                    {isSel && (
                      <div className="absolute inset-x-1 top-1 z-10 flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={isEq}
                          onClick={() => void equip(c)}
                          className="rounded-md bg-gold px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[#231b00] disabled:opacity-50"
                        >
                          {isEq ? "Equipped" : "Equip"}
                        </button>
                        <button
                          type="button"
                          disabled={listBusy === c.id}
                          onClick={() => void listForSale(c)}
                          className="rounded-md border border-white/25 bg-black/70 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-200 hover:border-[#ff9ba1]/50 disabled:opacity-50"
                        >
                          {listBusy === c.id ? "Listing…" : "List"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Save preset + Nano Banana render */}
          <div className="mt-auto space-y-3 border-t border-white/[0.06] pt-4">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={`Preset name (default: Preset ${loadouts.length + 1})`}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={equippedCount === 0}
                onClick={() => void savePreset()}
                className={cn(
                  BTN_GOLD,
                  "rounded-xl px-4 py-3 text-sm uppercase tracking-wide disabled:opacity-40",
                )}
              >
                Save Preset
              </button>
              <Link
                href="/studio?screen=customizer"
                className="grid place-items-center rounded-xl border border-gold/40 px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-gold transition hover:bg-gold/10"
              >
                Nano Banana Render
              </Link>
            </div>

            {loadouts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Saved Presets</p>
                {loadouts.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/30 px-3 py-1.5"
                  >
                    <span className="truncate text-xs font-semibold text-white">{l.name}</span>
                    <Button size="sm" variant="outline" onClick={() => void studio.equipLoadout(l.id)}>
                      Equip
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function StatusPill({ online }: { online: boolean | null }) {
  if (online === null) {
    return (
      <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wider text-neutral-400">
        Connecting…
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
        online ? "border-green/40 bg-green/10 text-green" : "border-gold/40 bg-gold/10 text-gold",
      )}
    >
      {online ? "Live" : "Demo · offline"}
    </span>
  );
}

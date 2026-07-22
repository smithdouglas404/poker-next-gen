"use client";

import { useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, RARITY, cn } from "@/features/ui/tokens";
import { DYE_SWATCHES } from "./presets";
import type { Cosmetic, EquippedMap } from "./types";

function rarityText(rarity: string): string {
  return (RARITY[rarity as keyof typeof RARITY] ?? RARITY.common).text;
}

function fmtPrice(cents?: number): string {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// Right rail, middle — owned wardrobe (non-model cosmetics) with equip + dye,
// plus a read-only browse of the live shop catalog (cosmetic_list).
export function WardrobePanel({
  inventory,
  catalog,
  equipped,
  online,
  onEquip,
  onDye,
}: {
  inventory: Cosmetic[];
  catalog: Cosmetic[];
  equipped: EquippedMap;
  online: boolean | null;
  onEquip: (id: string) => void;
  onDye: (id: string, params: Record<string, string>) => void;
}) {
  const [dyeFor, setDyeFor] = useState<string | null>(null);
  const owned = inventory.filter((c) => c.kind !== "model");

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "text-gold/80")}>Wardrobe &amp; Dye</p>

      {owned.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">No wardrobe items owned yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {owned.map((c) => {
            const isEquipped = equipped[c.kind] === c.id;
            const showDye = dyeFor === c.id;
            return (
              <div key={c.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{c.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {c.kind} · <span className={rarityText(c.rarity)}>{c.rarity}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDyeFor(showDye ? null : c.id)}
                      className="rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-300 hover:border-white/30"
                    >
                      Dye
                    </button>
                    <Button
                      size="sm"
                      variant={isEquipped ? "outline" : "gold"}
                      disabled={isEquipped}
                      onClick={() => onEquip(c.id)}
                    >
                      {isEquipped ? "On" : "Equip"}
                    </Button>
                  </div>
                </div>
                {showDye && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DYE_SWATCHES.map((sw) => (
                      <button
                        key={sw.id}
                        type="button"
                        title={sw.label}
                        onClick={() => {
                          onDye(c.id, { primary: sw.hex, accent: sw.hex });
                          setDyeFor(null);
                        }}
                        className="h-6 w-6 rounded-full border border-white/25 transition hover:scale-110"
                        style={{ background: sw.hex }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {catalog.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Shop Catalog {online === false && "(demo)"}
          </p>
          <div className="space-y-1.5">
            {catalog.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-neutral-200">{c.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">{c.kind}</p>
                </div>
                <span className="ml-2 shrink-0 text-[11px] font-semibold text-gold">
                  {fmtPrice(c.price_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

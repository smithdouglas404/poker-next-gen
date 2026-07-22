"use client";

import { useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, RARITY, cn } from "@/features/ui/tokens";
import { DYE_SWATCHES } from "./presets";
import { tileGradient } from "./demo";
import type { Cosmetic, EquippedMap } from "./types";

function rarityStyle(rarity: string) {
  return RARITY[rarity as keyof typeof RARITY] ?? RARITY.common;
}

function Thumb({ item }: { item: Cosmetic }) {
  const [failed, setFailed] = useState(false);
  const showImg = item.preview_ref && !failed;
  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/15"
      style={showImg ? undefined : { background: tileGradient(item.id) }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview_ref}
          alt={item.name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl">🎭</div>
      )}
    </div>
  );
}

// The center column — analogous to the master's scrolling hand-history log:
// one rich row per owned character with thumbnail, metadata, and live actions.
export function CharacterGallery({
  inventory,
  equipped,
  online,
  onEquip,
  onDye,
}: {
  inventory: Cosmetic[];
  equipped: EquippedMap;
  online: boolean | null;
  onEquip: (id: string) => void;
  onDye: (id: string, params: Record<string, string>) => void;
}) {
  const [dyeFor, setDyeFor] = useState<string | null>(null);
  const models = inventory.filter((c) => c.kind === "model");

  return (
    <div className={cn(GLASS_PANEL, "flex h-full flex-col p-5")}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
          Your Characters
        </h2>
        <span className="text-xs text-neutral-500">{models.length} owned</span>
      </div>

      {models.length === 0 ? (
        <div className="mt-6 flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-neutral-500">
          No characters yet — compose one on the left to mint your first 3D avatar.
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {models.map((c) => {
            const isEquipped = equipped.model === c.id;
            const rs = rarityStyle(c.rarity);
            const glbHref =
              c.asset_ref && c.asset_ref.startsWith("/api/model/") ? c.asset_ref : null;
            const showDye = dyeFor === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-xl border bg-black/30 p-3 transition",
                  isEquipped
                    ? "border-brand/50 shadow-[0_2px_18px_-6px_rgba(224,30,43,0.35)]"
                    : "border-white/[0.08] hover:border-white/20",
                )}
              >
                <div className="flex items-center gap-3">
                  <Thumb item={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                      {c.demo && (
                        <span className="shrink-0 rounded border border-gold/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                          Demo
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          rs.text,
                          rs.border,
                        )}
                      >
                        {c.rarity}
                      </span>
                      {glbHref ? (
                        <a
                          href={glbHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] uppercase tracking-wider text-muted hover:text-foreground hover:underline"
                        >
                          View GLB
                        </a>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider text-neutral-600">
                          3D model
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      size="sm"
                      variant={isEquipped ? "outline" : "gold"}
                      disabled={isEquipped}
                      onClick={() => onEquip(c.id)}
                    >
                      {isEquipped ? "Equipped" : "Equip"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDyeFor(showDye ? null : c.id)}
                    >
                      {showDye ? "Close" : "Dye"}
                    </Button>
                  </div>
                </div>

                {showDye && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                      Accent dye {online === false && "(demo)"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DYE_SWATCHES.map((sw) => (
                        <button
                          key={sw.id}
                          type="button"
                          title={sw.label}
                          onClick={() => {
                            onDye(c.id, { primary: sw.hex, accent: sw.hex });
                            setDyeFor(null);
                          }}
                          className="h-7 w-7 rounded-full border border-white/25 transition hover:scale-110"
                          style={{ background: sw.hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

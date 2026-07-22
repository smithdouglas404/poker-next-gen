"use client";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import type { Cosmetic, EquippedMap } from "./types";
import { GEN_FEE_CENTS } from "./presets";

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

// Mirrors the master's "Financial Summary" rail: headline totals over a dense
// per-item ledger. Here it summarizes the player's minted-character economy.
export function StudioSummary({
  inventory,
  equipped,
}: {
  inventory: Cosmetic[];
  equipped: EquippedMap;
}) {
  const models = inventory.filter((c) => c.kind === "model");
  const cosmetics = inventory.filter((c) => c.kind !== "model");
  const totalSpend = models.length * GEN_FEE_CENTS;
  const equippedModel = models.find((m) => m.id === equipped.model);

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "text-center text-gold/80")}>Studio Summary</p>

      <div className="mt-4 space-y-3">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400">Characters Minted</p>
          <p className="font-display text-2xl font-bold text-white">{models.length}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400">Total Generation Spend</p>
          <p className="font-display text-2xl font-bold text-gold">{fmtMoney(totalSpend)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Equipped Character</p>
        <p className="mt-1 truncate text-sm font-semibold text-green">
          {equippedModel ? equippedModel.name : "None equipped"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <p className="font-display text-lg font-bold text-white">{models.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">3D Models</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <p className="font-display text-lg font-bold text-white">{cosmetics.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Wardrobe</p>
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
            <span>Character</span>
            <span>Rarity</span>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-neutral-200">{m.name}</span>
                <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-gold/70">
                  {m.rarity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

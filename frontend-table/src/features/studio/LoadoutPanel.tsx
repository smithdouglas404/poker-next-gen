"use client";

import { useState } from "react";

import { Button, Input } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import type { EquippedMap, Loadout } from "./types";

function slotCount(slotsJson: string): number {
  try {
    const s = JSON.parse(slotsJson) as Record<string, string>;
    return Object.values(s).filter(Boolean).length;
  } catch {
    return 0;
  }
}

// Right rail, bottom — save the current equipped set as a named loadout and
// re-equip saved outfits in one click (loadout_save / loadout_list / loadout_equip).
export function LoadoutPanel({
  loadouts,
  equipped,
  onSave,
  onEquip,
}: {
  loadouts: Loadout[];
  equipped: EquippedMap;
  onSave: (name: string, slots: EquippedMap) => void;
  onEquip: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const equippedCount = Object.values(equipped).filter(Boolean).length;

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "text-gold/80")}>Loadouts</p>

      <div className="mt-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Loadout name"
          className="flex-1"
        />
        <Button
          size="sm"
          disabled={!name.trim() || equippedCount === 0}
          onClick={() => {
            onSave(name, equipped);
            setName("");
          }}
        >
          Save
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-500">
        Saves your {equippedCount} equipped slot{equippedCount === 1 ? "" : "s"} as a named outfit.
      </p>

      {loadouts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {loadouts.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{l.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {slotCount(l.slots_json)} slots{l.demo ? " · demo" : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onEquip(l.id)}>
                Equip
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

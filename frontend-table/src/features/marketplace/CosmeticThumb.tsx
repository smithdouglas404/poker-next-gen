"use client";

import { cn } from "@/features/ui/tokens";
import { rarityStyle } from "./rarity";

const KIND_ICON: Record<string, string> = {
  model: "🎭",
  avatar: "🎭",
  card_back: "🂠",
  deck: "🂠",
  felt: "🟢",
  table: "🟢",
  frame: "🖼️",
  seat_effect: "✨",
  win_celebration: "🎉",
  entrance_animation: "🚪",
  chip: "🪙",
};

function iconFor(kind: string | undefined): string {
  return (kind && KIND_ICON[kind]) ?? "🎴";
}

/**
 * Rarity-lit preview tile. Uses the item's image when present and degrades to a
 * kind-appropriate monogram glyph on a graphite gradient when it 404s / is empty.
 */
export function CosmeticThumb({
  preview,
  kind,
  rarity,
  className,
}: {
  preview?: string;
  kind?: string;
  rarity?: string;
  className?: string;
}) {
  const style = rarityStyle(rarity);
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden bg-gradient-to-br from-white/[0.06] to-black/60",
        className,
      )}
      style={{ boxShadow: `inset 0 0 40px ${style.glow}` }}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      {!preview && (
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-70">
          {iconFor(kind)}
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: `inset 0 0 0 1px ${style.glow}` }}
      />
    </div>
  );
}

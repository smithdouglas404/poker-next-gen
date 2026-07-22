"use client";

import { useEffect, useState } from "react";

import { useDeckStyle } from "@/features/table/deckStyle";
import { useStackUnit } from "@/features/table/stackDisplay";
import { soundManager, type SoundPack } from "@/features/sound/soundManager";

const SUIT_SWATCH = [
  { suit: "♠", two: "text-neutral-100", four: "text-neutral-100" },
  { suit: "♥", two: "text-red-500", four: "text-red-500" },
  { suit: "♦", two: "text-red-500", four: "text-blue-500" },
  { suit: "♣", two: "text-neutral-100", four: "text-green-500" },
];

/** Per-device table preferences. Four-color deck is the headline option —
 *  clubs green, diamonds blue so suits can't be misread in fast play. */
export function TableSettings() {
  const [deck, setDeck] = useDeckStyle();
  const fourColor = deck === "four-color";

  const [stackUnit, setStackUnit] = useStackUnit();
  const inBB = stackUnit === "bb";

  const [pack, setPack] = useState<SoundPack>("studio");
  useEffect(() => {
    setPack(soundManager.getPack());
    return soundManager.subscribePack(setPack);
  }, []);
  const selectPack = (p: SoundPack) => {
    soundManager.setPack(p);
    soundManager.play("deal"); // instant preview
  };

  return (
    <aside className="pointer-events-auto flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-white/[0.06] bg-surface p-3 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <p className="text-xs uppercase tracking-[0.25em] text-muted">Table</p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-neutral-300">Four-color deck</span>
        <button
          type="button"
          role="switch"
          aria-checked={fourColor}
          onClick={() => setDeck(fourColor ? "two-color" : "four-color")}
          className={`relative h-5 w-9 rounded-full transition ${
            fourColor ? "bg-green" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              fourColor ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-neutral-300">Stacks in big blinds</span>
        <button
          type="button"
          role="switch"
          aria-checked={inBB}
          onClick={() => setStackUnit(inBB ? "chips" : "bb")}
          className={`relative h-5 w-9 rounded-full transition ${inBB ? "bg-green" : "bg-white/15"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              inBB ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
        {SUIT_SWATCH.map((s) => (
          <span
            key={s.suit}
            className={`text-lg leading-none ${fourColor ? s.four : s.two}`}
          >
            {s.suit}
          </span>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <span className="text-[11px] text-neutral-300">Sound pack</span>
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              { key: "studio", label: "Studio", hint: "Synthesized" },
              { key: "recorded", label: "Recorded", hint: "ElevenLabs" },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPack(p.key)}
              className={`flex flex-col items-start rounded-lg border px-2 py-1 text-left transition ${
                pack === p.key
                  ? "border-brand/60 bg-brand/15 text-white"
                  : "border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/25"
              }`}
            >
              <span className="text-xs font-semibold">{p.label}</span>
              <span className="text-[9px] text-neutral-500">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

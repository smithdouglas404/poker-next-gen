"use client";

import { useDeckStyle } from "@/features/table/deckStyle";

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

  return (
    <aside className="pointer-events-auto flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Table</p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-neutral-300">Four-color deck</span>
        <button
          type="button"
          role="switch"
          aria-checked={fourColor}
          onClick={() => setDeck(fourColor ? "two-color" : "four-color")}
          className={`relative h-5 w-9 rounded-full transition ${
            fourColor ? "bg-amber-500" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              fourColor ? "left-[18px]" : "left-0.5"
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
    </aside>
  );
}

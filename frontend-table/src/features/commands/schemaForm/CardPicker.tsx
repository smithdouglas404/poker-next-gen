"use client";

import { useMemo, useState } from "react";

// Visual card picker (UI review P1-6): poker players know "AsKh" notation but
// still mistype it, and it's hostile to casual players. A 52-card, suit-colored
// grid emits the notation string; free-text stays available as a fallback.

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS: Array<{ s: string; glyph: string; cls: string }> = [
  { s: "s", glyph: "♠", cls: "text-neutral-100" },
  { s: "h", glyph: "♥", cls: "text-[#e5484d]" },
  { s: "d", glyph: "♦", cls: "text-[#2f6bff]" }, // four-color deck: diamonds blue
  { s: "c", glyph: "♣", cls: "text-[#1fa85a]" }, // clubs green
];

/** Parse a notation string ("AsKh") into ["As","Kh"]. */
export function parseCards(notation: string): string[] {
  const out: string[] = [];
  const s = notation.replace(/\s+/g, "");
  for (let i = 0; i + 1 < s.length; i += 2) {
    out.push(s[i].toUpperCase() + s[i + 1].toLowerCase());
  }
  return out;
}

export function CardPicker({
  value,
  max,
  onChange,
  onClose,
  label,
}: {
  value: string;
  max: number;
  onChange: (notation: string) => void;
  onClose: () => void;
  label: string;
}) {
  const [selected, setSelected] = useState<string[]>(() => parseCards(value));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (card: string) => {
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      if (prev.length >= max) return prev; // at capacity
      return [...prev, card];
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Pick ${label}`}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface-2 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">Pick {label}</p>
            <p className="text-sm text-neutral-300">
              {selected.length}/{max} selected — {selected.join(" ") || "none"}
            </p>
          </div>
          <button type="button" onClick={() => setSelected([])} className="text-[11px] uppercase tracking-wider text-neutral-400 hover:text-white">
            Clear
          </button>
        </div>

        <div className="space-y-1">
          {SUITS.map((suit) => (
            <div key={suit.s} className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
              {RANKS.map((rank) => {
                const card = rank + suit.s;
                const on = selectedSet.has(card);
                const full = !on && selected.length >= max;
                return (
                  <button
                    key={card}
                    type="button"
                    disabled={full}
                    onClick={() => toggle(card)}
                    aria-pressed={on}
                    className={`flex aspect-[3/4] flex-col items-center justify-center rounded-md border text-sm font-bold transition ${
                      on
                        ? "border-gold bg-gold/20 text-white"
                        : full
                          ? "border-white/5 bg-black/30 opacity-30"
                          : "border-white/10 bg-black/40 hover:border-white/30"
                    }`}
                  >
                    <span>{rank}</span>
                    <span className={`text-xs ${suit.cls}`}>{suit.glyph}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => { onChange(selected.join("")); onClose(); }}
            className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2 text-sm font-bold uppercase tracking-wider text-black"
          >
            Use {selected.length} card{selected.length === 1 ? "" : "s"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Several card groups — one per player. Value is an array of notation strings
 *  ("AsAh", "7c2d"); onChange emits the same. Used for `holes` / `villain_holes`. */
export function HandsField({
  value,
  onChange,
  cardsPerHand,
  label = "Player",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  cardsPerHand: number;
  label?: string;
}) {
  const hands = Array.isArray(value) ? value : [];
  const setAt = (i: number, v: string) => onChange(hands.map((h, idx) => (idx === i ? v : h)));
  const addHand = () => onChange([...hands, ""]);
  const removeHand = (i: number) => onChange(hands.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {hands.map((h, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {label} {i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeHand(i)}
              className="text-[11px] text-neutral-500 hover:text-brand"
            >
              Remove
            </button>
          </div>
          <CardField label="" value={h} max={cardsPerHand} onChange={(v) => setAt(i, v)} />
        </div>
      ))}
      <button
        type="button"
        onClick={addHand}
        className="w-full rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gold hover:border-gold/40 hover:bg-white/[0.03]"
      >
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

/** A labeled card field: shows the notation + a button to pick visually. */
export function CardField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cards = parseCards(value);
  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-neutral-200">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="flex min-h-[38px] flex-1 flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/40 px-2 py-1.5">
          {cards.length === 0 && <span className="text-xs text-neutral-500">No cards picked</span>}
          {cards.map((c) => {
            const suit = SUITS.find((s) => s.s === c[1].toLowerCase());
            return (
              <span key={c} className="rounded bg-white/10 px-1.5 py-0.5 text-sm font-bold text-white">
                {c[0]}
                <span className={suit?.cls}>{suit?.glyph}</span>
              </span>
            );
          })}
        </div>
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gold hover:bg-gold/15">
          Pick
        </button>
      </div>
      {open && (
        <CardPicker label={label} value={value} max={max} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

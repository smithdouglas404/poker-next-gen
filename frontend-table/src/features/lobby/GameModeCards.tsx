"use client";

import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

// The HRC "Game Mode Selection" hero: three large cards — Private Table,
// Public Game (Club Owner Sponsored, locked unless the caller can sponsor),
// and Tournament. Clean GGPoker cards on near-black; accent encodes intent —
// Accent roles, corrected: GOLD = primary/premium, green = play-money/positive.
// "red" is retained as a key so callers keep compiling, but it now renders gold.
// It used to paint the Private Table title AND its CREATE PRIVATE TABLE button
// solid red — the app's main creation action rendered in the danger colour, on
// the screen a player hits first. Red is destructive/danger only.

type Accent = "red" | "gold" | "green";

const ACCENT: Record<Accent, { ring: string; text: string; glow: string; dot: string }> = {
  red: {
    ring: "hover:border-gold/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]",
    text: "text-gold-lite",
    glow: "rgba(245,197,24,0.18)",
    dot: "bg-gold",
  },
  gold: {
    ring: "hover:border-gold/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]",
    text: "text-gold",
    glow: "rgba(245,197,24,0.18)",
    dot: "bg-gold",
  },
  green: {
    ring: "hover:border-green/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]",
    text: "text-green",
    glow: "rgba(34,197,94,0.18)",
    dot: "bg-green",
  },
};

export interface ModeCardDef {
  key: "private" | "public" | "playmoney" | "tournament";
  title: string;
  subtitle?: string;
  blurb: string;
  cta: string;
  accent: Accent;
  scene: "lounge" | "casino" | "arena";
  locked?: boolean;
  lockedHint?: string;
}

export function GameModeCards({
  cards,
  onSelect,
}: {
  cards: ModeCardDef[];
  onSelect: (key: ModeCardDef["key"]) => void;
}) {
  return (
    // Four modes (Private / Public / Play money / Tournament) in a 3-column grid left
    // one card stranded on its own row. Two-up on tablet, four across on desktop.
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <ModeCard key={c.key} def={c} onSelect={() => onSelect(c.key)} />
      ))}
    </div>
  );
}

function ModeCard({ def, onSelect }: { def: ModeCardDef; onSelect: () => void }) {
  const a = ACCENT[def.accent];
  const locked = !!def.locked;

  // Layout notes, because this card had three separate alignment faults:
  //  1. The title rendered TWICE — once in the header, once again under the art
  //     ("PRIVATE TABLE" over the tile and "PRIVATE TABLE" under it).
  //  2. Everything was centre-aligned, so blurbs of different lengths produced
  //     ragged edges on all four cards at once.
  //  3. `min-h-[3rem]` on the blurb only set a floor. A 3-line blurb next to a
  //     4-line one still pushed its CTA a row lower, so the four buttons sat at
  //     four different heights.
  // Now: art first, ONE title, left-aligned copy, and `mt-auto` on the button so
  // every CTA lands on the same baseline whatever the blurb does.
  return (
    <article
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "group relative flex flex-col overflow-hidden transition",
        a.ring,
        locked && "opacity-95",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.07]">
        <SceneArt scene={def.scene} muted={locked} />
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/60 backdrop-blur-[2px]">
            <LockIcon />
            <span className="max-w-[86%] rounded-lg border border-gold/30 bg-black/70 px-3 py-1.5 text-center text-[11px] font-semibold leading-snug text-gold">
              {def.lockedHint ?? "Only Club Owners can sponsor Public Games"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3
          className={cn(
            "font-display text-[19px] font-bold uppercase tracking-wider",
            locked ? "text-neutral-400" : a.text,
          )}
        >
          {def.title}
        </h3>
        {def.subtitle && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-neutral-500">
            {def.subtitle}
          </p>
        )}
        <p className="mt-3 pb-6 text-[13.5px] leading-relaxed text-neutral-400">{def.blurb}</p>

        <button
          type="button"
          onClick={onSelect}
          disabled={locked}
          className={cn(
            // `mt-auto` pushes the button to the card's foot so all four land on
            // one baseline. Spacing above it must be PADDING, not another margin —
            // an `mt-6` here silently competed with `mt-auto` and the CTAs sat at
            // four different heights.
            "mt-auto w-full rounded-xl px-5 pt-3 text-sm font-bold uppercase tracking-wide transition",
            "py-3",
            locked
              ? "cursor-not-allowed border border-white/10 bg-white/[0.02] text-neutral-500"
              : def.accent === "green"
                ? "border border-green/40 text-green hover:bg-green/5"
                : "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] hover:shadow-[0_6px_18px_-6px_rgba(245,197,24,0.4)] hover:-translate-y-px",
          )}
        >
          {def.cta}
        </button>
      </div>
    </article>
  );
}

/**
 * Three motifs, one family: gold line-work on a dark wash.
 *
 * "lounge" was a saturated green blob — a rounded rectangle with a 50% radius —
 * sitting in the middle of the card. It read as a smear, not a poker table, and
 * green is the money colour so it was off-role besides. All three are now drawn
 * as SVG at a consistent stroke weight so the four cards look like a set.
 */
function SceneArt({ scene, muted }: { scene: "lounge" | "casino" | "arena"; muted?: boolean }) {
  const wash =
    scene === "lounge"
      ? "radial-gradient(75% 95% at 50% 100%, rgba(245,197,24,0.10), transparent 70%), linear-gradient(180deg,#0b0d0f,#12140f 60%,#0b0d0f)"
      : scene === "casino"
        ? "radial-gradient(60% 80% at 50% 45%, rgba(245,197,24,0.11), transparent 70%), linear-gradient(180deg,#0b0d0f,#15130d 60%,#0b0d0f)"
        : "radial-gradient(85% 75% at 50% 15%, rgba(245,197,24,0.09), transparent 70%), linear-gradient(180deg,#0b0d0f,#0f1210 60%,#0b0d0f)";

  const G = "#d4af37";

  return (
    <div
      className="absolute inset-0"
      style={{ background: wash, filter: muted ? "saturate(0.4) brightness(0.8)" : undefined }}
    >
      <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full" aria-hidden>
        {scene === "lounge" && (
          <g fill="none" stroke={G} strokeWidth="1.4">
            {/* felt oval with a rail, and seats around it */}
            <rect x="34" y="34" width="92" height="42" rx="21" opacity="0.9" />
            <rect x="39" y="39" width="82" height="32" rx="16" opacity="0.35" />
            {[
              [44, 27], [80, 24], [116, 27],
              [44, 83], [80, 86], [116, 83],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="5" opacity="0.75" />
            ))}
          </g>
        )}

        {scene === "casino" && (
          <g>
            {/* chip stacks, tallest in the middle */}
            {[
              [46, 6], [66, 9], [86, 12], [106, 8], [126, 5],
            ].map(([x, n], i) => (
              <g key={i}>
                {Array.from({ length: n }).map((_, k) => (
                  <ellipse
                    key={k}
                    cx={x}
                    cy={78 - k * 4}
                    rx="12"
                    ry="3.6"
                    fill="none"
                    stroke={G}
                    strokeWidth="1.2"
                    opacity={0.35 + (k / n) * 0.5}
                  />
                ))}
              </g>
            ))}
          </g>
        )}

        {scene === "arena" && (
          <g fill="none" stroke={G} strokeWidth="1.4">
            {/* a bracket collapsing to one winner */}
            <path d="M20 22h16v18h16M20 58h16V40" opacity="0.6" />
            <path d="M140 22h-16v18h-16M140 58h-16V40" opacity="0.6" />
            <path d="M52 40h56" opacity="0.85" />
            <circle cx="80" cy="40" r="9" opacity="0.9" />
            <path d="M76 40l3 3 5-6" strokeWidth="1.6" opacity="0.9" />
            {/* podium */}
            <path d="M58 84h20V70H58zM82 84h20V64H82zM106 84h20V74h-20z" opacity="0.45" />
          </g>
        )}
      </svg>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" stroke="#f5c518" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#f5c518" strokeWidth="1.6" />
      <circle cx="12" cy="15.5" r="1.6" fill="#f5c518" />
    </svg>
  );
}

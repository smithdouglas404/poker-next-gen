"use client";

import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

// The HRC "Game Mode Selection" hero: three large cards — Private Table,
// Public Game (Club Owner Sponsored, locked unless the caller can sponsor),
// and Tournament. Clean GGPoker cards on near-black; accent encodes intent —
// red = primary, gold = club/premium, green = play/positive.

type Accent = "red" | "gold" | "green";

const ACCENT: Record<Accent, { ring: string; text: string; glow: string; dot: string }> = {
  red: {
    ring: "hover:border-brand/50 hover:shadow-[0_4px_18px_rgba(0,0,0,0.5)]",
    text: "text-brand",
    glow: "rgba(224,30,43,0.18)",
    dot: "bg-brand",
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
  key: "private" | "public" | "tournament";
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
    <div className="grid gap-6 lg:grid-cols-3">
      {cards.map((c) => (
        <ModeCard key={c.key} def={c} onSelect={() => onSelect(c.key)} />
      ))}
    </div>
  );
}

function ModeCard({ def, onSelect }: { def: ModeCardDef; onSelect: () => void }) {
  const a = ACCENT[def.accent];
  const locked = !!def.locked;

  return (
    <article
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "group relative flex flex-col overflow-hidden p-6 transition",
        a.ring,
        locked && "opacity-95",
      )}
    >
      <header className="text-center">
        <h3
          className={cn(
            "font-display text-xl font-bold uppercase tracking-wider",
            locked ? "text-neutral-400" : a.text,
          )}
        >
          {def.title}
        </h3>
        {def.subtitle && (
          <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-neutral-500">
            {def.subtitle}
          </p>
        )}
      </header>

      {/* themed scene tile */}
      <div className="relative mt-5 aspect-[16/10] overflow-hidden rounded-xl border border-white/10">
        <SceneArt scene={def.scene} muted={locked} />
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-[2px]">
            <LockIcon />
            <span className="max-w-[80%] rounded-lg border border-gold/30 bg-black/60 px-3 py-1.5 text-center text-[11px] font-semibold text-gold">
              {def.lockedHint ?? "Only Club Owners can sponsor Public Games"}
            </span>
          </div>
        )}
      </div>

      <h4
        className={cn(
          "mt-5 text-center font-display text-lg font-bold uppercase tracking-wide",
          locked ? "text-neutral-500" : "text-foreground",
        )}
      >
        {def.title}
      </h4>
      <p className="mt-2 min-h-[3rem] text-center text-sm leading-relaxed text-neutral-400">
        {def.blurb}
      </p>

      <button
        type="button"
        onClick={onSelect}
        disabled={locked}
        className={cn(
          "mt-5 w-full rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide transition",
          locked
            ? "cursor-not-allowed border border-white/10 bg-white/[0.02] text-neutral-500"
            : def.accent === "gold"
              ? "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] hover:shadow-[0_6px_18px_-6px_rgba(245,197,24,0.4)] hover:-translate-y-px"
              : def.accent === "red"
                ? "bg-gradient-to-b from-[#ff2d3f] via-[#e01e2b] to-[#b3151f] text-white hover:shadow-[0_6px_18px_-6px_rgba(224,30,43,0.4)] hover:-translate-y-px"
                : "border border-green/40 text-green hover:bg-green/5",
        )}
      >
        {def.cta}
      </button>
    </article>
  );
}

function SceneArt({ scene, muted }: { scene: "lounge" | "casino" | "arena"; muted?: boolean }) {
  // Clean GGPoker tiles: near-black base with a restrained single-tone wash —
  // no environmental neon depth.
  const bg =
    scene === "lounge"
      ? "radial-gradient(70% 90% at 50% 100%, rgba(224,30,43,0.10), transparent 70%), linear-gradient(180deg,#0b0d0f,#111417 60%,#0b0d0f)"
      : scene === "casino"
        ? "radial-gradient(60% 80% at 50% 40%, rgba(245,197,24,0.10), transparent 70%), linear-gradient(180deg,#0b0d0f,#15130d 60%,#0b0d0f)"
        : "radial-gradient(80% 70% at 50% 20%, rgba(34,197,94,0.10), transparent 70%), linear-gradient(180deg,#0b0d0f,#0d130f 60%,#0b0d0f)";

  return (
    <div className="absolute inset-0" style={{ background: bg, filter: muted ? "saturate(0.5)" : undefined }}>
      {scene === "lounge" && (
        <div
          className="absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border"
          style={{
            borderColor: "rgba(245,197,24,0.5)",
            background: "radial-gradient(closest-side, rgba(28,125,78,0.85), rgba(10,125,67,0.5))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6), inset 0 0 16px rgba(0,0,0,0.5)",
          }}
        />
      )}
      {scene === "casino" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 pb-4">
          {["#e01e2b", "#f5c518", "#22c55e", "#9aa0a6", "#e01e2b"].map((c, i) => (
            <span
              key={i}
              className="h-8 w-6 rounded-sm"
              style={{ background: `linear-gradient(180deg, ${c}, rgba(0,0,0,0.45))` }}
            />
          ))}
        </div>
      )}
      {scene === "arena" && (
        <div className="absolute inset-0 flex items-end justify-center gap-1 pb-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="w-2 rounded-t bg-green/40"
              style={{ height: `${20 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
      )}
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

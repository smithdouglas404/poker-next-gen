"use client";

import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

// The HRC "Game Mode Selection" hero: three large cards — Private Table,
// Public Game (Club Owner Sponsored, locked unless the caller can sponsor),
// and Tournament. Reproduces the master's layout + data density in our theme;
// each card art is a themed R3F-adjacent gradient scene, not photographic.

type Accent = "cyan" | "gold" | "purple";

const ACCENT: Record<Accent, { ring: string; text: string; glow: string; dot: string }> = {
  cyan: {
    ring: "hover:border-cyan/50 hover:shadow-[0_0_36px_rgba(129,236,255,0.16)]",
    text: "text-cyan",
    glow: "rgba(129,236,255,0.18)",
    dot: "bg-cyan",
  },
  gold: {
    ring: "hover:border-gold/50 hover:shadow-[0_0_36px_rgba(212,175,55,0.18)]",
    text: "text-gold",
    glow: "rgba(212,175,55,0.18)",
    dot: "bg-gold",
  },
  purple: {
    ring: "hover:border-[#b44dff]/50 hover:shadow-[0_0_36px_rgba(180,77,255,0.18)]",
    text: "text-[#c98bff]",
    glow: "rgba(180,77,255,0.18)",
    dot: "bg-[#b44dff]",
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
              ? "bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] text-black hover:shadow-[0_0_22px_rgba(212,175,55,0.35)]"
              : cn("border", a.text, def.accent === "cyan" ? "border-cyan/40 hover:bg-cyan/5" : "border-[#b44dff]/40 hover:bg-[#b44dff]/5"),
        )}
      >
        {def.cta}
      </button>
    </article>
  );
}

function SceneArt({ scene, muted }: { scene: "lounge" | "casino" | "arena"; muted?: boolean }) {
  const bg =
    scene === "lounge"
      ? "radial-gradient(70% 90% at 50% 100%, rgba(28,125,78,0.7), transparent 70%), linear-gradient(180deg,#0b0b0e,#141019 60%,#0b0b0e)"
      : scene === "casino"
        ? "radial-gradient(60% 80% at 50% 40%, rgba(180,77,255,0.35), transparent 70%), linear-gradient(180deg,#0b0b0e,#1a1224 60%,#0b0b0e)"
        : "radial-gradient(80% 70% at 50% 20%, rgba(129,236,255,0.3), transparent 70%), linear-gradient(180deg,#0b0b0e,#0d1620 60%,#0b0b0e)";

  return (
    <div className="absolute inset-0" style={{ background: bg, filter: muted ? "saturate(0.5)" : undefined }}>
      {scene === "lounge" && (
        <div
          className="absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border"
          style={{
            borderColor: "rgba(212,175,55,0.6)",
            background: "radial-gradient(closest-side, rgba(28,125,78,0.9), rgba(15,95,57,0.6))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6), inset 0 0 16px rgba(0,0,0,0.5)",
          }}
        />
      )}
      {scene === "casino" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 pb-4">
          {["#e5484d", "#2f6bff", "#e9c46a", "#1fa85a", "#b44dff"].map((c, i) => (
            <span
              key={i}
              className="h-8 w-6 rounded-sm"
              style={{ background: `linear-gradient(180deg, ${c}, rgba(0,0,0,0.4))`, boxShadow: `0 0 10px ${c}66` }}
            />
          ))}
        </div>
      )}
      {scene === "arena" && (
        <div className="absolute inset-0 flex items-end justify-center gap-1 pb-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="w-2 rounded-t bg-cyan/30"
              style={{ height: `${20 + ((i * 37) % 60)}%`, boxShadow: "0 0 8px rgba(129,236,255,0.4)" }}
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
      <rect x="4" y="10" width="16" height="11" rx="2" stroke="#d4af37" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#d4af37" strokeWidth="1.6" />
      <circle cx="12" cy="15.5" r="1.6" fill="#d4af37" />
    </svg>
  );
}

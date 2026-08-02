"use client";
// ── GameModeCards v2 — Premium dark-casino game mode selector ────────────────
// Four large cards: Private Table, Public Game, Play Money, Tournament.
// Upgraded with richer scene art, animated glow borders, better typography,
// and a lock overlay for restricted modes.
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Accent = "red" | "gold" | "green";

const ACCENT: Record<Accent, {
  ring: string; text: string; glow: string; dot: string;
  border: string; accentLine: string; btnBg: string;
}> = {
  red: {
    ring:       "hover:border-[#e01e2b]/60 hover:shadow-[0_0_32px_rgba(224,30,43,0.20)]",
    text:       "text-[#ff2d3f]",
    glow:       "rgba(224,30,43,0.15)",
    dot:        "bg-[#e01e2b]",
    border:     "rgba(224,30,43,0.18)",
    accentLine: "linear-gradient(90deg,transparent,rgba(224,30,43,0.60),transparent)",
    btnBg:      "bg-gradient-to-r from-[#b91c1c] to-[#e01e2b] text-white shadow-[0_2px_12px_rgba(224,30,43,0.35)]",
  },
  gold: {
    ring:       "hover:border-[#f5c518]/60 hover:shadow-[0_0_32px_rgba(245,197,24,0.20)]",
    text:       "text-[#f5c518]",
    glow:       "rgba(245,197,24,0.12)",
    dot:        "bg-[#f5c518]",
    border:     "rgba(245,197,24,0.18)",
    accentLine: "linear-gradient(90deg,transparent,rgba(245,197,24,0.60),transparent)",
    btnBg:      "bg-gradient-to-r from-[#92700a] to-[#f5c518] text-black shadow-[0_2px_12px_rgba(245,197,24,0.30)]",
  },
  green: {
    ring:       "hover:border-[#22c55e]/60 hover:shadow-[0_0_32px_rgba(34,197,94,0.20)]",
    text:       "text-[#22c55e]",
    glow:       "rgba(34,197,94,0.12)",
    dot:        "bg-[#22c55e]",
    border:     "rgba(34,197,94,0.18)",
    accentLine: "linear-gradient(90deg,transparent,rgba(34,197,94,0.60),transparent)",
    btnBg:      "bg-gradient-to-r from-[#15803d] to-[#22c55e] text-white shadow-[0_2px_12px_rgba(34,197,94,0.30)]",
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
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
        "group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300",
        a.ring,
        locked && "opacity-90",
      )}
      style={{
        background: `linear-gradient(160deg,${a.glow},rgba(22,27,35,0.95))`,
        borderColor: a.border,
      }}
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: a.accentLine }} />

      {/* Scene art */}
      <div className="relative h-36 overflow-hidden">
        <SceneArt scene={def.scene} muted={locked} accent={def.accent} />
        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-[3px]">
            <LockIcon accent={def.accent} />
            <span className="max-w-[80%] rounded-lg border border-[#f5c518]/30 bg-black/70 px-3 py-1.5 text-center text-[11px] font-semibold text-[#f5c518]">
              {def.lockedHint ?? "Club Owners only"}
            </span>
          </div>
        )}
        {/* Mode badge */}
        <div className="absolute left-3 top-3">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
              def.accent === "red"   ? "border-[#e01e2b]/40 bg-[#e01e2b]/10 text-[#ff2d3f]" :
              def.accent === "gold"  ? "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]" :
              "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]",
            )}
          >
            {def.subtitle ?? def.key}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className={cn("font-display text-xl font-bold uppercase tracking-wide leading-tight", locked ? "text-neutral-400" : a.text)}>
            {def.title}
          </h3>
          <p className="mt-2 text-[12px] leading-relaxed text-neutral-400">{def.blurb}</p>
        </div>

        <button
          type="button"
          disabled={locked}
          onClick={onSelect}
          className={cn(
            "mt-auto w-full rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition",
            "disabled:cursor-not-allowed disabled:opacity-40",
            locked
              ? "border border-white/10 text-neutral-500"
              : cn(a.btnBg, "hover:brightness-110"),
          )}
        >
          {locked ? "Locked" : def.cta}
        </button>
      </div>
    </article>
  );
}

function SceneArt({ scene, muted, accent }: { scene: ModeCardDef["scene"]; muted?: boolean; accent: Accent }) {
  const opacity = muted ? 0.35 : 1;
  const feltColor = accent === "green" ? "rgba(28,125,78,0.70)" : accent === "gold" ? "rgba(120,80,10,0.50)" : "rgba(100,20,20,0.50)";

  return (
    <div
      className="absolute inset-0 transition-opacity"
      style={{
        opacity,
        background: `radial-gradient(ellipse at 50% 80%, ${feltColor}, rgba(10,13,18,0.95))`,
      }}
    >
      {scene === "lounge" && (
        <>
          {/* Felt oval */}
          <div
            className="absolute left-1/2 top-1/2 h-20 w-36 -translate-x-1/2 -translate-y-1/2 rounded-[999px] border"
            style={{
              borderColor: "rgba(245,197,24,0.40)",
              background: "radial-gradient(closest-side,rgba(28,125,78,0.80),rgba(10,60,35,0.60))",
              boxShadow: "0 0 30px rgba(28,125,78,0.30), inset 0 0 20px rgba(0,0,0,0.50)",
            }}
          />
          {/* Seat pips */}
          {[
            { top: "20%", left: "20%" }, { top: "20%", left: "50%" }, { top: "20%", left: "80%" },
            { top: "70%", left: "20%" }, { top: "70%", left: "50%" }, { top: "70%", left: "80%" },
          ].map((pos, i) => (
            <span
              key={i}
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                top: pos.top, left: pos.left,
                borderColor: "rgba(245,197,24,0.50)",
                background: "linear-gradient(135deg,#ffe066,#c9a000)",
                boxShadow: "0 0 8px rgba(245,197,24,0.30)",
              }}
            />
          ))}
        </>
      )}
      {scene === "casino" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 pb-4">
          {["#e01e2b","#f5c518","#22c55e","#9aa0a6","#e01e2b"].map((c, i) => (
            <span
              key={i}
              className="h-12 w-7 rounded-t"
              style={{
                background: `linear-gradient(180deg,${c},rgba(0,0,0,0.50))`,
                boxShadow: `0 0 12px ${c}40`,
              }}
            />
          ))}
        </div>
      )}
      {scene === "arena" && (
        <div className="absolute inset-0 flex items-end justify-center gap-1 pb-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <span
              key={i}
              className="w-2.5 rounded-t"
              style={{
                height: `${18 + ((i * 41) % 65)}%`,
                background: `linear-gradient(180deg,rgba(34,197,94,0.70),rgba(34,197,94,0.15))`,
                boxShadow: "0 0 6px rgba(34,197,94,0.25)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LockIcon({ accent }: { accent: Accent }) {
  const color = accent === "gold" ? "#f5c518" : accent === "green" ? "#22c55e" : "#e01e2b";
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke={color} strokeWidth="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="15.5" r="1.8" fill={color} />
    </svg>
  );
}

"use client";

import { useEffect, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { profileApi, type PlayerRank, type RankTier } from "./profileRpc";

// Tier accent — enlisted steel → NCO green → officer gold → general bright gold.
const TIER_ACCENT: Record<RankTier, { ring: string; text: string; glow: string }> = {
  enlisted: { ring: "border-[#5b6472]", text: "text-[#c2c8d0]", glow: "rgba(91,100,114,0.35)" },
  nco: { ring: "border-[#22c55e]/50", text: "text-[#22c55e]", glow: "rgba(34,197,94,0.35)" },
  officer: { ring: "border-[#f5c518]/55", text: "text-[#f5c518]", glow: "rgba(245,197,24,0.4)" },
  general: { ring: "border-[#ffd54a]/70", text: "text-[#ffd54a]", glow: "rgba(255,213,74,0.55)" },
};

/** A single up-chevron mark (enlisted / NCO), drawn as crisp SVG. */
function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 12" className={cn("h-2.5 w-5", className)} aria-hidden>
      <path d="M2 11 L12 2 L22 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Render the pay-grade insignia as DOM marks (never baked into an image). */
function Insignia({ insignia, tier }: { insignia: string; tier: RankTier }) {
  const accent = TIER_ACCENT[tier];
  const [kind, nStr] = insignia.split("-");
  const n = Number(nStr) || 0;
  if (kind === "star") {
    return (
      <div className={cn("flex gap-0.5", accent.text)} aria-label={`${n} star`}>
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className="text-sm leading-none">★</span>
        ))}
      </div>
    );
  }
  if (kind === "chevron") {
    if (n === 0) return null;
    return (
      <div className={cn("flex flex-col-reverse items-center gap-0.5", accent.text)} aria-label={`${n} chevrons`}>
        {Array.from({ length: n }).map((_, i) => (
          <Chevron key={i} />
        ))}
      </div>
    );
  }
  if (kind === "bar") {
    return (
      <div className={cn("flex gap-1", accent.text)} aria-label={`${n} bars`}>
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className="inline-block h-4 w-1.5 rounded-sm bg-current" />
        ))}
      </div>
    );
  }
  if (kind === "leaf") return <span className={cn("text-lg leading-none", accent.text)} aria-label="oak leaf">❦</span>;
  if (kind === "eagle") return <span className={cn("text-lg leading-none", accent.text)} aria-label="eagle">▲</span>;
  return null;
}

/** Player rank badge — a US-military pay grade earned from real play (hands,
 * wins, tournament entries, HRP). Reads `player_rank`; crisp text/marks stay in
 * the DOM. `compact` renders an inline chip; otherwise a full panel with the
 * progress bar to the next promotion. */
export function RankBadge({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const [rank, setRank] = useState<PlayerRank | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await profileApi.rank(userId);
        if (!cancelled) setRank(r);
      } catch {
        /* guest / offline → no badge */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!rank) return null;
  const accent = TIER_ACCENT[rank.tier];

  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", accent.ring)}
        title={`${rank.name} · service score ${rank.score.toLocaleString()}`}
      >
        <Insignia insignia={rank.insignia} tier={rank.tier} />
        <span className={cn("font-display text-xs font-bold uppercase tracking-wide", accent.text)}>{rank.abbr}</span>
      </span>
    );
  }

  return (
    <div className={cn(GLASS_PANEL, "p-4")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Service Rank</p>
      <div className="mt-2 flex items-center gap-3">
        <div
          className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2", accent.ring)}
          style={{ boxShadow: `0 0 18px ${accent.glow}` }}
        >
          <Insignia insignia={rank.insignia} tier={rank.tier} />
        </div>
        <div className="min-w-0">
          <p className={cn("font-display text-lg font-bold leading-tight", accent.text)}>{rank.name}</p>
          <p className="text-[11px] text-white/45">
            {rank.grade} · {rank.score.toLocaleString()} service pts
          </p>
        </div>
      </div>
      {rank.next_grade ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9a7b2c] via-[#f5c518] to-[#ffd54a]"
              style={{ width: `${rank.progress_pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-white/40">
            {rank.score_to_next.toLocaleString()} pts to <span className={accent.text}>{rank.next_name}</span>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-[#ffd54a]">Top brass — maximum rank achieved</p>
      )}
    </div>
  );
}

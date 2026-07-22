"use client";

// Shared DOM primitives for the in-table overlay states (paused, player report,
// kick/ban, breaking news). GGPoker look: solid #262d38 cards, hairline borders,
// gold headings, red destructive, green money. All text lives in the DOM
// (CLAUDE.md DOM-overlay-for-text rule); nothing is baked into WebGL.

import { GLASS_PANEL, HEADING_LG, cn } from "@/features/ui/tokens";

/** Circular portrait with a colored ring + soft glow, matching the seat chrome. */
export function OverlayAvatar({
  src,
  ring = "#3a4250",
  size = 44,
}: {
  src: string;
  ring?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: `2px solid ${ring}`,
        boxShadow: `0 0 12px ${ring}55, inset 0 0 8px rgba(0,0,0,0.6)`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} style={{ objectFit: "cover", display: "block" }} />
    </div>
  );
}

/** Standard centered modal shell with a gold title bar and dimmed backdrop. */
export function OverlayModal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          GLASS_PANEL,
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden border-gold/25 shadow-[0_0_60px_rgba(0,0,0,0.7)]",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        style={{ background: "#262d38" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className={cn(HEADING_LG, "text-gold")}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-neutral-400 hover:border-white/30 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-white/10 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
// Four-color deck (matches deckStyle.ts / the cinematic card faces).
const SUIT_COLOR: Record<string, string> = {
  s: "#101317",
  h: "#e5484d",
  d: "#2f6bff",
  c: "#1fa85a",
};

/** A small DOM playing card (rank + four-color suit) for hand-history rows. */
export function MiniCard({ code }: { code: string }) {
  const rank = code.slice(0, code.length - 1) || "?";
  const suit = code.slice(-1).toLowerCase();
  const color = SUIT_COLOR[suit] ?? "#101317";
  return (
    <span
      className="inline-flex h-8 w-6 flex-col items-center justify-center rounded-[4px] border border-black/10 bg-white text-[11px] font-bold leading-none shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
      style={{ color }}
    >
      <span>{rank}</span>
      <span className="text-[12px]">{SUIT_GLYPH[suit] ?? "?"}</span>
    </span>
  );
}

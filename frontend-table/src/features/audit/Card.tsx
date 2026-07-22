"use client";

import { cn } from "@/features/ui/tokens";

// Four-color deck exactly as mandated by the design system:
// spades #101317, hearts #e5484d, diamonds #2f6bff (blue), clubs #1fa85a (green).
const SUIT: Record<string, { glyph: string; color: string }> = {
  s: { glyph: "♠", color: "#c7ccd6" }, // spade (rendered light on dark card)
  h: { glyph: "♥", color: "#e5484d" },
  d: { glyph: "♦", color: "#2f6bff" },
  c: { glyph: "♣", color: "#1fa85a" },
};

const RANK_DISPLAY: Record<string, string> = { T: "10" };

export function PlayingCard({
  card,
  size = "md",
  className,
}: {
  card: string; // e.g. "Ah", "Ts", "8d"
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rank = card[0] ?? "?";
  const suitKey = (card[1] ?? "s").toLowerCase();
  const suit = SUIT[suitKey] ?? SUIT.s;
  const rankText = RANK_DISPLAY[rank] ?? rank;

  const sizing =
    size === "lg"
      ? "h-20 w-14 text-2xl"
      : size === "sm"
        ? "h-12 w-9 text-sm"
        : "h-16 w-12 text-lg";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border border-white/15",
        "bg-gradient-to-b from-[#15181f] to-[#0d0f14] shadow-[0_2px_10px_rgba(0,0,0,0.5)]",
        sizing,
        className,
      )}
    >
      <span className="font-display font-bold leading-none text-white" style={{ color: "#f4f5f8" }}>
        {rankText}
      </span>
      <span className="leading-none" style={{ color: suit.color, fontSize: "1.1em" }}>
        {suit.glyph}
      </span>
    </div>
  );
}

"use client";

import type { CardView } from "@/features/game/protocol";

function cardLabel(code: string): string {
  if (!code) return "?";
  return code.replace("T", "10");
}

export function CommunityCards({ board, phase }: { board: CardView[]; phase: string }) {
  const slots = [0, 1, 2, 3, 4];
  const labels = ["Flop", "Flop", "Flop", "Turn", "River"];

  return (
    <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
      <p className="mb-2 text-center text-[10px] uppercase tracking-[0.35em] text-neutral-500">
        {phase} · Community
      </p>
      <div className="flex gap-2">
        {slots.map((i) => {
          const card = board[i];
          return (
            <div
              key={i}
              className={`flex h-20 w-14 flex-col items-center justify-center rounded-lg border-2 shadow-lg ${
                card
                  ? "border-white/30 bg-white text-black"
                  : "border-dashed border-white/15 bg-black/30 text-neutral-600"
              }`}
            >
              {card ? (
                <span className="text-lg font-bold">{cardLabel(card.code)}</span>
              ) : (
                <span className="text-[9px] uppercase">{labels[i]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

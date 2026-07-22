"use client";

// Full-screen blocking overlay shown to every seated player when the host pauses
// the table (snapshot.host_paused). RESUME is host-only (OpHostAction resume);
// QUIT stands the player up (OpStandUp). Matches the HRC "GAME PAUSED BY ADMIN"
// master.

import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

export function GamePausedOverlay({
  canResume,
  onResume,
  onQuit,
}: {
  canResume: boolean;
  onResume: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div
        className={cn(
          GLASS_PANEL,
          "relative flex w-full max-w-2xl flex-col items-center gap-6 border-gold/30 px-10 py-12 text-center shadow-[0_0_80px_rgba(0,0,0,0.8)]",
        )}
        style={{ background: "#1c2128" }}
      >
        <div className="w-full">
          <h1 className="font-display text-4xl font-bold uppercase tracking-[0.15em] text-gold sm:text-5xl">
            Game Paused by Admin
          </h1>
          <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
          <p className="mt-4 text-sm text-neutral-300">Waiting for admin to resume…</p>
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <button
            type="button"
            onClick={onResume}
            disabled={!canResume}
            className={cn(
              BTN_GOLD,
              "w-full max-w-sm rounded-xl px-8 py-3 text-base uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            Resume Game
          </button>
          <button
            type="button"
            onClick={onQuit}
            className={cn(
              GLASS_PANEL,
              "w-full max-w-[220px] rounded-xl border-white/15 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30 hover:text-white",
            )}
          >
            Quit Table
          </button>
        </div>

        {!canResume && (
          <p className="text-[11px] text-neutral-500">Only the table host can resume play.</p>
        )}
      </div>
    </div>
  );
}

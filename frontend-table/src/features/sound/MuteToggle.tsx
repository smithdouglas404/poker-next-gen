"use client";

import { useSound } from "./useSound";

/** Small mute/unmute toggle for the table HUD. Preference persists to localStorage. */
export function MuteToggle() {
  const { muted, toggleMute } = useSound();

  return (
    <button
      type="button"
      onClick={() => toggleMute()}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Sound off" : "Sound on"}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs uppercase tracking-wider transition ${
        muted
          ? "border-white/10 text-neutral-500 hover:text-neutral-300"
          : "border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
      }`}
    >
      <span aria-hidden className="text-sm leading-none">
        {muted ? "🔇" : "🔊"}
      </span>
      <span>{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}

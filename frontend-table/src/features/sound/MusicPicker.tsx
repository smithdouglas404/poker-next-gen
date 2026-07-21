"use client";

import { useEffect, useState } from "react";

import { MUSIC_TRACKS } from "./library";
import { soundManager } from "./soundManager";

/** Player-controlled background music: pick a track, play/pause, set volume, or
 *  paste a URL for your own library. */
export function MusicPicker() {
  const [, force] = useState(0);
  const [url, setUrl] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  useEffect(() => {
    setUrl(soundManager.getBgmUrl());
    return soundManager.subscribeBgm(() => {
      setUrl(soundManager.getBgmUrl());
      force((n) => n + 1);
    });
  }, []);

  const playing = soundManager.isBgmPlaying();
  const volume = soundManager.getBgmVolume();

  const select = (trackUrl: string) => {
    soundManager.setBgmTrack(trackUrl);
    soundManager.playBgm();
  };

  return (
    <aside className="pointer-events-auto flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Music</p>
        <button
          type="button"
          onClick={() => soundManager.toggleBgm()}
          disabled={!url}
          className="rounded-full border border-amber-400/40 px-3 py-0.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-40"
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {MUSIC_TRACKS.map((t) => {
          const active = url === t.url;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.url)}
              className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                active
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                  : "border-white/10 bg-white/[0.02] text-neutral-200 hover:border-white/25"
              }`}
            >
              <span className="truncate">
                {active && playing ? "♪ " : ""}
                {t.title}
              </span>
              {t.unlicensed && (
                <span
                  title="Not cleared for commercial use — replace before charging members"
                  className="ml-2 shrink-0 rounded bg-red-500/15 px-1 text-[9px] font-bold uppercase text-red-300"
                >
                  demo
                </span>
              )}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-[10px] text-neutral-400">
        Vol
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => soundManager.setBgmVolume(parseFloat(e.target.value))}
          className="h-1 flex-1 accent-amber-400"
        />
      </label>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Paste a track URL…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-white placeholder:text-neutral-600 focus:border-amber-400/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            const u = customUrl.trim();
            if (u) select(u);
          }}
          disabled={customUrl.trim() === ""}
          className="rounded-lg bg-amber-500/80 px-2 py-1 text-[11px] font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </aside>
  );
}

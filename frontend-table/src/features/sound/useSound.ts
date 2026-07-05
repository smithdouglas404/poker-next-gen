"use client";

import { useCallback, useEffect, useState } from "react";

import { soundManager, type SoundCue } from "./soundManager";

/**
 * React binding for the {@link soundManager} singleton.
 *
 * Keeps a component subscribed to the shared mute state (so any toggle stays in
 * sync everywhere), and arms the gesture-based AudioContext unlock on mount.
 */
export function useSound() {
  const [muted, setMutedState] = useState(() => soundManager.isMuted());

  useEffect(() => {
    soundManager.armGestureInit();
    setMutedState(soundManager.isMuted());
    return soundManager.subscribe(setMutedState);
  }, []);

  const play = useCallback((cue: SoundCue) => soundManager.play(cue), []);
  const toggleMute = useCallback(() => soundManager.toggleMuted(), []);
  const setMuted = useCallback((next: boolean) => soundManager.setMuted(next), []);

  return { muted, play, toggleMute, setMuted };
}

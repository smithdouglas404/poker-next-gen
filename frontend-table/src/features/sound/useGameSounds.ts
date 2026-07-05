"use client";

import { useEffect, useRef } from "react";

import { useGame } from "@/features/game/GameProvider";
import type { SoundCue } from "./soundManager";
import { useSound } from "./useSound";

/** Map a server-side seat `last_action` to a cue. */
function actionCue(action: string): SoundCue | null {
  switch (action) {
    case "fold":
      return "fold";
    case "check":
      return "check";
    case "call":
      return "call";
    case "raise":
    case "all_in":
      return "bet";
    default:
      return null;
  }
}

/**
 * Fires sound cues off the existing game state — no new opcodes required.
 *
 * - `deal`  : hole cards arrive / a new community card is dealt
 * - action  : any seat's `last_action` changes (covers hero + opponents)
 * - `turn`  : it becomes the hero's turn to act
 * - `win`   : a showdown result lands
 *
 * Mount once (e.g. in `TableHud`), mirroring the `usePokerKeyboard` pattern.
 */
export function useGameSounds() {
  const { snapshot, holeCards, actionRequired, showdown, profile } = useGame();
  const { play } = useSound();

  const prevHoleLen = useRef(0);
  const prevBoardLen = useRef(0);
  const prevActions = useRef<Map<number, string>>(new Map());
  const prevTurnActive = useRef(false);
  const prevShowdown = useRef<unknown>(null);
  const hydrated = useRef(false);

  // Hole cards dealt (0 -> N transition).
  useEffect(() => {
    const len = holeCards.length;
    if (len > 0 && prevHoleLen.current === 0) play("deal");
    prevHoleLen.current = len;
  }, [holeCards, play]);

  // New community card(s) revealed.
  useEffect(() => {
    const len = snapshot?.board.length ?? 0;
    if (len > prevBoardLen.current) play("deal");
    prevBoardLen.current = len;
  }, [snapshot?.board, play]);

  // Per-seat action changes (hero and opponents alike).
  useEffect(() => {
    const seats = snapshot?.seats;
    if (!seats) return;
    const next = new Map<number, string>();
    for (const seat of seats) {
      const action = seat.last_action ?? "";
      next.set(seat.index, action);
      // Suppress cues for the state that existed before we subscribed.
      if (hydrated.current && action && prevActions.current.get(seat.index) !== action) {
        const cue = actionCue(action);
        if (cue) play(cue);
      }
    }
    prevActions.current = next;
    hydrated.current = true;
  }, [snapshot?.seats, play]);

  // Hero's turn to act.
  useEffect(() => {
    const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
    const active = !!actionRequired && actionRequired.seat === heroSeat;
    if (active && !prevTurnActive.current) play("turn");
    prevTurnActive.current = active;
  }, [actionRequired, snapshot?.seats, profile.userId, play]);

  // Showdown result.
  useEffect(() => {
    if (showdown && showdown !== prevShowdown.current) play("win");
    prevShowdown.current = showdown;
  }, [showdown, play]);
}

"use client";

import { useEffect } from "react";

import { useGame } from "@/features/game/GameProvider";

/** OddSlingers-style keyboard shortcuts (F/C/R). */
export function usePokerKeyboard() {
  const { actionRequired, sendAction, profile, snapshot } = useGame();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const heroSeat = snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1;
      if (!actionRequired || actionRequired.seat !== heroSeat) return;

      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        void sendAction("fold", 0);
      } else if (key === "c") {
        e.preventDefault();
        if (actionRequired.valid_actions.includes("check")) void sendAction("check", 0);
        else if (actionRequired.valid_actions.includes("call")) void sendAction("call", 0);
      } else if (key === "r" && actionRequired.valid_actions.includes("raise")) {
        e.preventDefault();
        void sendAction("raise", actionRequired.min_raise);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionRequired, sendAction, profile.userId, snapshot?.seats]);
}

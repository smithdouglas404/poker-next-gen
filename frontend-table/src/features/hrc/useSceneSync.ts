"use client";

// Pushes the adapted snapshot into HRC's zustand store, which is what its R3F scene
// reads from. The scene subscribes to exactly five fields — players, boardCards, pot,
// phase, currentTurnSeat — so this is the whole 3D binding.
//
// Both renderers therefore consume the SAME view model: ImageTable takes the adapter
// output as props, the 3D scene takes it via this store. Switching between them can
// never show two different games.

import { useEffect } from "react";
import type { TableSnapshot } from "@/features/game/protocol";
import { useGameStore, type PlayerState } from "./store/useGameStore";
import { toCards, toGameState, toPlayers, seatId } from "./adapter";
import { avatarSrc } from "@/features/table/avatars";

/** HRC's scene-side PlayerState is a different shape from its UI-side Player. */
function toScenePlayers(snap: TableSnapshot): PlayerState[] {
  const uiPlayers = toPlayers(snap);
  return (snap.seats ?? [])
    .filter((s) => s.user_id)
    .map((seat) => {
      const ui = uiPlayers.find((p) => p.id === seatId(seat));
      const folded = ui?.status === "folded";
      const allIn = ui?.status === "all-in";
      return {
        id: seatId(seat),
        seatIndex: seat.index,
        displayName: seat.username || `Seat ${seat.index + 1}`,
        avatar: seat.user_id ? avatarSrc(seat.user_id) : "",
        // We don't track a per-hand starting stack on the snapshot; current stack is
        // the honest value for both rather than inventing a delta.
        stackStart: seat.stack ?? 0,
        stackCurrent: seat.stack ?? 0,
        holeCards: seat.is_hero ? [] : [],
        status: folded ? "folded" : allIn ? "all-in" : seat.sitting_out ? "out" : "active",
        result: "neutral",
        amountDelta: 0,
        handLabel: "",
      } satisfies PlayerState;
    });
}

/** Mirror server state into the scene store. One-way; the store is never authoritative. */
export function useSceneSync(snapshot: TableSnapshot | null): void {
  const setPlayers = useGameStore((s) => s.setPlayers);
  const setPot = useGameStore((s) => s.setPot);
  const setBoardCards = useGameStore((s) => s.setBoardCards);
  const setPhase = useGameStore((s) => s.setPhase);
  const setCurrentTurnSeat = useGameStore((s) => s.setCurrentTurnSeat);

  useEffect(() => {
    if (!snapshot) return;
    const gs = toGameState(snapshot);
    setPlayers(toScenePlayers(snapshot));
    setPot(gs.pot);
    setBoardCards(toCards(snapshot.board));
    setPhase(gs.phase);
    setCurrentTurnSeat(snapshot.action_seat ?? -1);
  }, [snapshot, setPlayers, setPot, setBoardCards, setPhase, setCurrentTurnSeat]);
}

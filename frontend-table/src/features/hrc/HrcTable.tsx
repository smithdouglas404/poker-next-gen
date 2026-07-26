"use client";

// The HRC table bound to live Nakama state.
//
// HRC's ImageTable is used unmodified — this component only supplies it with props
// translated from our snapshot by ./adapter. Keeping the translation in one place
// means the ported tree stays a clean copy we can re-sync from the HRC repo.
//
// Client-only: ImageTable pulls in framer-motion and reads the DOM, so mount it via
// next/dynamic with ssr:false (CLAUDE.md golden rule 3).

import { useMemo } from "react";
import { useGame } from "@/features/game/GameProvider";
import { ImageTable } from "./components/ImageTable";
import { GameUIProvider } from "./lib/game-ui-context";
import { adaptSnapshot } from "./adapter";
import { avatarSrc } from "@/features/table/avatars";

export default function HrcTable() {
  const { snapshot, holeCards } = useGame();

  const adapted = useMemo(
    () =>
      snapshot
        ? adaptSnapshot(snapshot, {
            heroCards: holeCards,
            // Reuse our existing avatar catalog rather than HRC's placeholder set.
            avatarFor: (seat) => (seat.user_id ? avatarSrc(seat.user_id) : undefined),
          })
        : null,
    [snapshot, holeCards],
  );

  // No snapshot yet = not connected/seated. Render nothing rather than a fake table:
  // the view is a projection of server state or it shows nothing.
  if (!adapted || !snapshot) return null;

  return (
    <GameUIProvider>
      <div className="relative h-full w-full">
        <ImageTable
          communityCards={adapted.gameState.communityCards}
          pot={adapted.gameState.pot}
          playerCount={adapted.players.length}
          maxSeats={adapted.maxSeats}
          players={adapted.players}
          dealerSeatIndex={adapted.dealerSeatIndex}
          visibleCommunityCards={adapted.gameState.communityCards.length}
          communityFlipped
          dealPhase={adapted.gameState.phase}
          handNumber={adapted.gameState.handNumber}
          blinds={{
            small: adapted.gameState.smallBlind ?? 0,
            big: adapted.gameState.bigBlind ?? 0,
          }}
        />
      </div>
    </GameUIProvider>
  );
}

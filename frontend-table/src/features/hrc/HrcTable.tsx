"use client";

// The HRC table bound to live Nakama state, with the 2.5D / 3D switch.
//
// The renderer is chosen at TABLE SETUP: the owner picks "Table Look" in
// PrivateTableSetup, which ships render_style ("2.5d" | "3d") through
// TableCreateRequest -> MatchState -> snapshot. `override` exists only so the proof
// page can preview either without creating a table.
//
// Both branches consume the SAME adapted view model — ImageTable takes it as props,
// the R3F scene takes it via useSceneSync's store — so switching can never show two
// different games.
//
// Client-only: framer-motion, three and drei all touch the DOM/WebGL, so mount this
// via next/dynamic with ssr:false (CLAUDE.md golden rule 3).

import { useMemo } from "react";
import { useGame } from "@/features/game/GameProvider";
import { ImageTable } from "./components/ImageTable";
import { PokerSceneCanvas } from "./scene/canvas/PokerSceneCanvas";
import { GameUIProvider } from "./lib/game-ui-context";
import { adaptSnapshot } from "./adapter";
import { useSceneSync } from "./useSceneSync";
import { avatarSrc } from "@/features/table/avatars";

export type HrcRenderStyle = "2.5d" | "3d";

export default function HrcTable({ override }: { override?: HrcRenderStyle }) {
  const { snapshot, holeCards } = useGame();

  // Keep the 3D store in step regardless of which branch renders, so toggling mid-hand
  // does not show a stale table for a frame.
  useSceneSync(snapshot);

  const adapted = useMemo(
    () =>
      snapshot
        ? adaptSnapshot(snapshot, {
            heroCards: holeCards,
            // Our avatar catalog, not HRC's placeholder set.
            avatarFor: (seat) => (seat.user_id ? avatarSrc(seat.user_id) : undefined),
          })
        : null,
    [snapshot, holeCards],
  );

  // No snapshot = not connected/seated. Render nothing rather than a fake table: the
  // view is a projection of server state or it shows nothing.
  if (!adapted || !snapshot) return null;

  const style: HrcRenderStyle = override ?? (snapshot.render_style === "3d" ? "3d" : "2.5d");

  return (
    <GameUIProvider>
      <div className="relative h-full w-full">
        {style === "3d" ? (
          <PokerSceneCanvas
            className="absolute inset-0"
            activeSeat={snapshot.action_seat}
          />
        ) : (
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
        )}
      </div>
    </GameUIProvider>
  );
}

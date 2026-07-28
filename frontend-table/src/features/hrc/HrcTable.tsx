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
import { adaptSnapshot, toCards } from "./adapter";
import type { CardType } from "./lib/poker-types";
import { useSceneSync } from "./useSceneSync";
import { avatarSrc } from "@/features/table/avatars";
import { Seat } from "./components/Seat";
import { HeroHoleCards } from "./components/HeroHoleCards";
import { TABLE_SEATS, FELT_BOUNDS } from "./lib/table-constants";
import { seatId } from "./adapter";
import { DEMO_HOLE, DEMO_SNAPSHOT } from "@/features/table3d/demoSnapshot";

export type HrcRenderStyle = "2.5d" | "3d";

export default function HrcTable({
  override,
  demo = false,
}: {
  override?: HrcRenderStyle;
  /** Preview against DEMO_SNAPSHOT instead of the live match, same as
   *  LiveCinematicTable's ?demo=1 — lets the renderers be reviewed without a table. */
  demo?: boolean;
}) {
  const live = useGame();
  const snapshot = demo ? DEMO_SNAPSHOT : live.snapshot;
  const holeCards = demo ? DEMO_HOLE : live.holeCards;

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

  // Map an adapted player id back to its real seat index on the snapshot.
  const seatIndexOf = (snap: typeof snapshot, id: string): number =>
    (snap?.seats ?? []).find((s) => seatId(s) === id)?.index ?? 0;
  const heroSeatIdx = (snapshot.seats ?? []).find((s) => s.is_hero)?.index ?? 0;
  // `holeCards` (above) is unconditionally the hero's own cards — the private
  // channel only ever carries the viewer's hand — so convert it directly
  // rather than going through the adapter's `is_hero`-gated Player.cards
  // (which is empty for demo data, since DEMO_SNAPSHOT never sets is_hero).
  // Seat.tsx deliberately skips rendering the hero's own cards on their
  // avatar, so this is the one place they surface.
  const heroHole = toCards(holeCards);
  const heroCardsPair: [CardType, CardType] | undefined =
    heroHole.length >= 2 ? [heroHole[0], heroHole[1]] : undefined;

  // Visual (post hero-rotation) seat indices that actually hold a player —
  // ImageTable's vacant-slot layer needs this per-index, not a headcount, or
  // a sparse table (occupied seats out of order) leaves real seats blank and
  // draws a stray "join" circle over an already-occupied seat.
  const occupiedSeatIndices = adapted.players.map(
    (player) => (seatIndexOf(snapshot, player.id) - heroSeatIdx + adapted.maxSeats) % adapted.maxSeats,
  );

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
          <>
            <ImageTable
            communityCards={adapted.gameState.communityCards}
            pot={adapted.gameState.pot}
            playerCount={adapted.players.length}
            maxSeats={adapted.maxSeats}
            players={adapted.players}
            occupiedSeatIndices={occupiedSeatIndices}
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

            {/* Seat layer. ImageTable draws ONLY the empty slots — its own comment says
                "Occupied seats rendered by Seat component" — so without this the table
                renders with no players at all.

                Bounds come from the SAME FELT_BOUNDS constant ImageTable's two layers
                use — previously this was a separately-duplicated copy of the same
                style, which is exactly how the three layers could drift out of sync
                with each other. */}
            <div style={{ ...FELT_BOUNDS, zIndex: 20 }}>
              {adapted.players.map((player) => {
                // Rotate so the hero is always at visual seat 0 (bottom centre).
                // HRC rotates over players.length; we rotate over SEAT index and
                // maxSeats instead, so players stay at their real seats and a
                // half-empty table doesn't bunch everyone together.
                const seatIdx = seatIndexOf(snapshot, player.id);
                const visual = (seatIdx - heroSeatIdx + adapted.maxSeats) % adapted.maxSeats;
                const pose = TABLE_SEATS[visual % TABLE_SEATS.length];
                return (
                  <Seat
                    key={player.id}
                    player={player}
                    position={{ x: pose.x, y: pose.y }}
                    isHero={seatIdx === heroSeatIdx}
                    seatIndex={visual}
                    perspectiveScale={pose.scale}
                  />
                );
              })}
            </div>

            <HeroHoleCards cards={heroCardsPair} communityCards={adapted.gameState.communityCards} />
          </>
        )}
      </div>
    </GameUIProvider>
  );
}

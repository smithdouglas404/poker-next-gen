"use client";

// The HRC table bound to live Nakama state.
//
// There is exactly ONE table renderer: ImageTable, the flat 2.5D felt image with
// a DOM/framer-motion overlay. There is no 3D table and no renderer switch. An
// R3F cinematic scene used to live behind a `render_style` / `override` branch,
// but /table hard-pinned override="2.5d" so that branch was unreachable for
// months while CLAUDE.md still documented the 3D scene as the design contract —
// which is precisely how "the table" came to mean two different things. The
// scene and the switch are both deleted; see CLAUDE.md "The table".
//
// Client-only: framer-motion touches the DOM, so mount this via next/dynamic
// with ssr:false (CLAUDE.md golden rule 3).

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useGame } from "@/features/game/GameProvider";
import { useFeltStyle } from "@/features/hud/feltLayout";
import { ImageTable } from "./components/ImageTable";
import { GameUIProvider } from "./lib/game-ui-context";
import { adaptSnapshot, toCards } from "./adapter";
import type { CardType, Player } from "./lib/poker-types";
import { avatarSrc } from "@/features/table/avatars";
import { Seat } from "./components/Seat";
import { HeroHoleCards } from "./components/HeroHoleCards";
import { ShowdownOverlay } from "./components/ShowdownOverlay";
import { PlayerDetailModal } from "@/features/hud/PlayerDetailModal";
import { adaptShowdown } from "./lib/showdownAdapter";
import { TABLE_SEATS, FELT_BOUNDS } from "./lib/table-constants";
import { seatId } from "./adapter";
import { DEMO_HOLE, DEMO_SNAPSHOT } from "@/features/table3d/demoSnapshot";
import type { TableSnapshot } from "@/features/game/protocol";

// DEMO_SNAPSHOT (features/table3d, shared/frozen) doesn't carry per-seat
// `bet` — it predates the bet-chip-stack rendering in Seat.tsx, so the demo
// table currently shows chips only in the center pot, never on the felt in
// front of a player. Rather than edit the frozen file, overlay demo-only bet
// amounts here, on the hrc side of the seam, matching each seat's
// last_action/status from DEMO_SNAPSHOT (call/raise -> the street's current
// bet of 250,000; all-in -> a larger shove; no action yet / folded -> 0).
const DEMO_BETS: Record<number, number> = {
  0: 250_000, // You — raise
  1: 250_000, // Neon Viper — call
  3: 250_000, // Shadow King — call
  4: 900_000, // Void Witch — all-in
  7: 250_000, // Chrome Siren — call
};

const DEMO_SNAPSHOT_WITH_BETS: TableSnapshot = {
  ...DEMO_SNAPSHOT,
  seats: DEMO_SNAPSHOT.seats.map((seat) => ({ ...seat, bet: DEMO_BETS[seat.index] ?? 0 })),
};

export default function HrcTable({
  demo = false,
}: {
  /** Preview against DEMO_SNAPSHOT instead of the live match — lets the table
   *  be reviewed without standing up a real match. */
  demo?: boolean;
}) {
  const live = useGame();
  // The felt must shift by the same amount SeatHud shifts the seat ring when
  // the Room Control drawer is open, or the table and its seats drift apart.
  const { style: feltStyle, insetLeft } = useFeltStyle();
  // One box for every FELT_BOUNDS consumer — felt image, ImageTable's overlay,
  // and the seat layer below — so they cannot drift apart.
  const snapshot = demo ? DEMO_SNAPSHOT_WITH_BETS : live.snapshot;
  const holeCards = demo ? DEMO_HOLE : live.holeCards;

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

  // Real showdown reveal (ShowdownOverlay), built entirely from the server's
  // own OpShowdown payload (see showdownAdapter.ts) — never a client-side
  // hand recomputation. No demo fixture exists for this, so ?demo=1 simply
  // never shows it (CLAUDE.md: demo data is opt-in, never a fallback).
  const showdown = demo ? null : live.showdown;
  const [showdownDismissed, setShowdownDismissed] = useState(false);
  // Player detail popup — click any seated player's avatar/name to see their
  // session state + real stats (player_stats RPC). See PlayerDetailModal.tsx
  // for why this stays scoped to stats only, no mute/report/friend actions.
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  useEffect(() => {
    if (showdown) setShowdownDismissed(false);
  }, [showdown]);
  const showdownData = useMemo(
    () => (showdown && adapted && snapshot ? adaptShowdown(showdown, snapshot, adapted.players) : null),
    [showdown, adapted, snapshot],
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
  // All dealt hole cards, not truncated to 2 — the backend deals 4 for PLO
  // (backend-core/poker/table.go holeCount()); HeroHoleCards renders however
  // many it's given.
  const heroCards: CardType[] | undefined = heroHole.length >= 2 ? heroHole : undefined;

  // Visual (post hero-rotation) seat indices that actually hold a player —
  // ImageTable's vacant-slot layer needs this per-index, not a headcount, or
  // a sparse table (occupied seats out of order) leaves real seats blank and
  // draws a stray "join" circle over an already-occupied seat.
  const occupiedSeatIndices = adapted.players.map(
    (player) => (seatIndexOf(snapshot, player.id) - heroSeatIdx + adapted.maxSeats) % adapted.maxSeats,
  );

  // DEALER_POSITIONS is indexed in the same hero-rotated "visual" space as
  // TABLE_SEATS (0 = hero, 1 = bottom-left, ...), but adapted.dealerSeatIndex
  // is the raw snapshot.button_seat — un-rotated. Passing it straight through
  // only happened to line up because every prior demo/test had the hero
  // seated at index 0; for any real hand where the hero isn't literally seat
  // 0, the dealer chip would render at the wrong seat. Rotate it the same way
  // occupiedSeatIndices and each Seat's position already are.
  const dealerVisualIndex =
    adapted.dealerSeatIndex >= 0
      ? (adapted.dealerSeatIndex - heroSeatIdx + adapted.maxSeats) % adapted.maxSeats
      : -1;

  return (
    <GameUIProvider>
      <div className="relative h-full w-full">
          <>
            <ImageTable
          insetLeft={insetLeft}
            communityCards={adapted.gameState.communityCards}
            pot={adapted.gameState.pot}
            playerCount={adapted.players.length}
            maxSeats={adapted.maxSeats}
            players={adapted.players}
            occupiedSeatIndices={occupiedSeatIndices}
            dealerSeatIndex={dealerVisualIndex}
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
            {/* MUST use the same inset-shifted box as the felt image and
                ImageTable's layers. This div was left on plain FELT_BOUNDS
                while the others shifted with the Room drawer, which put the
                avatars 144px (half the drawer width) left of the seat ring. */}
            <div style={{ ...feltStyle, zIndex: 20 }}>
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
                    // Real players only, live tables only — matches the
                    // reference (`showVideo={isMultiplayer && !player.isBot}`);
                    // demo has no real match to join a video room for.
                    showVideo={!demo && !player.isBot}
                    onPlayerClick={setSelectedPlayer}
                  />
                );
              })}

              {/* EVERY seat position is drawn by this one layer — occupied by
                  the <Seat> above, empty by the marker below — so a vacant slot
                  is exactly where its avatar will appear. SeatHud used to draw
                  the empty ones separately on its own computed ellipse, which
                  is how the "SIT HERE" squares ended up somewhere other than
                  the seats, and why a table whose snapshot lists fewer seats
                  than max_seats (DEMO_SNAPSHOT: 8 seats, max_seats 10) showed
                  no markers at all for the remainder. */}
              {Array.from({ length: adapted.maxSeats }, (_, visual) => visual)
                .filter((visual) => !occupiedSeatIndices.includes(visual))
                .map((visual) => {
                  const pose = TABLE_SEATS[visual % TABLE_SEATS.length];
                  return (
                    <div
                      key={`empty-${visual}`}
                      className="absolute flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed"
                      style={{
                        left: `${pose.x}%`,
                        top: `${pose.y}%`,
                        transform: `translate(-50%, -50%) scale(${pose.scale})`,
                        width: 104,
                        height: 104,
                        borderColor: "rgba(212,175,55,0.5)",
                        background: "rgba(212,175,55,0.08)",
                      }}
                    >
                      <span className="text-lg leading-none text-gold/80">+</span>
                      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-gold/70">
                        Seat {visual + 1}
                      </span>
                    </div>
                  );
                })}
            </div>

            {selectedPlayer && (
              <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
            )}

            <HeroHoleCards cards={heroCards} communityCards={adapted.gameState.communityCards} />

            {showdownData && (
              <ShowdownOverlay
                visible={!showdownDismissed}
                results={showdownData.results}
                players={showdownData.players}
                pot={showdown?.pot ?? 0}
                onDismiss={() => setShowdownDismissed(true)}
              />
            )}
          </>
      </div>
    </GameUIProvider>
  );
}

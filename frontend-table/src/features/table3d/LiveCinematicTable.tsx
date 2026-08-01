"use client";

// Live cinematic table: projects authoritative Nakama game state onto the shared
// prop-driven CinematicScene. The rendered scene is a pure projection of server
// truth (CLAUDE.md non-negotiable #3) — no optimistic values.
//
// ?demo=1 injects a static demo snapshot so the cinematic table renders
// populated without a live server (headless verification / owner review).

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { useRenderMode, type RenderMode } from "@/features/table/renderMode";
import { bakedPlate } from "@/features/table/bakedTable";
import { avatarDef } from "@/features/table/avatars";
import { heroSeatIndex } from "@/features/table/syncGameToCanvas";
import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS } from "@/features/game/protocol";
import type { CardView, SeatView, ShowdownMessage, TableSnapshot } from "@/features/game/protocol";
import { CinematicScene, type SceneSeat, type FeltControls } from "./CinematicScene";
import { TableAdminOverlay } from "./TableAdminOverlay";
import { HandHistoryPanel } from "@/features/hud/HandHistoryPanel";
import { BuyInDialog } from "@/features/hud/BuyInDialog";
import { DEMO_HERO_ID, DEMO_HOLE, DEMO_SHOWDOWN, DEMO_SNAPSHOT } from "./demoSnapshot";

function seatState(
  seat: SeatView,
  snapshot: TableSnapshot,
  showdown: ShowdownMessage | null,
): SceneSeat["state"] {
  if (showdown?.winners?.some((w) => w.seat === seat.index)) return "winner";
  if (seat.index === snapshot.action_seat && seat.status !== "empty") return "active";
  const status = (seat.status ?? "").toLowerCase();
  const last = (seat.last_action ?? "").toLowerCase();
  if (status === "all-in" || status === "allin" || last === "all-in" || last === "allin") return "allin";
  if (status === "folded") return "folded";
  return "idle";
}

// At showdown the server discloses the shown hands in showdown.hands (keyed by
// seat index or user id). Returns a seat's revealed [card, card] to flip face-up,
// or undefined while the hand is in progress / that seat is not shown.
function revealedHole(
  showdown: ShowdownMessage | null,
  seatIndex: number,
  userId?: string,
): [string, string] | undefined {
  const hands = showdown?.hands;
  if (!hands) return undefined;
  const h: CardView[] | undefined = hands[String(seatIndex)] ?? (userId ? hands[userId] : undefined);
  if (h && h.length >= 2) return [h[0].code, h[1].code];
  return undefined;
}

function ringForState(state: SceneSeat["state"]): string {
  switch (state) {
    case "active":
      return "#f3c14b";
    case "allin":
      return "#ef4444";
    case "folded":
      return "#3a4250";
    case "winner":
      return "#f3e2ad";
    default:
      return "#5b6472";
  }
}

function actionPill(seat: SeatView): SceneSeat["action"] {
  const last = (seat.last_action ?? "").toLowerCase();
  if (!last) return undefined;
  // The pill shows what THIS seat committed (seat.bet), not the table-wide
  // current_bet — otherwise a later raise retro-relabels everyone's pill.
  const bet = (seat.bet ?? 0) > 0 ? formatCents(seat.bet ?? 0) : undefined;
  switch (last) {
    case "fold":
    case "folded":
      return { label: "FOLD", tone: "fold" };
    case "check":
      return { label: "CHECK", tone: "call" };
    case "call":
      return { label: "CALL", amount: bet, tone: "call" };
    case "bet":
      return { label: "BET", amount: bet, tone: "raise" };
    case "raise":
      return { label: "RAISE", amount: bet, tone: "raise" };
    case "all-in":
    case "allin":
      return { label: "ALL-IN", amount: bet, tone: "allin" };
    default:
      return { label: last.toUpperCase(), tone: "call" };
  }
}

export default function LiveCinematicTable() {
  const search = useSearchParams();
  const demo = search.get("demo") === "1";

  const live = useGame();
  const [deviceMode] = useRenderMode();
  // Seat the player clicked on an empty tile; opens the existing buy-in dialog.
  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);

  const snapshot = demo ? DEMO_SNAPSHOT : live.snapshot;

  // A table's owner-chosen render_style OVERRIDES the per-device preference: every
  // seat renders in the table's style (no per-player mixing at one table). Falls
  // back to the per-device renderMode only for style-less (legacy) tables.
  const mode: RenderMode =
    snapshot?.render_style === "3d"
      ? "3d"
      : snapshot?.render_style === "2.5d"
        ? "2d"
        : deviceMode;
  const holeCards: CardView[] = demo ? DEMO_HOLE : live.holeCards;
  const showdown = demo ? DEMO_SHOWDOWN : live.showdown;
  const heroUserId = demo ? DEMO_HERO_ID : live.profile.userId;

  const scene = useMemo(() => {
    if (!snapshot) {
      // Not seated / no table yet: a graceful idle empty cinematic table.
      return {
        seats: [] as SceneSeat[],
        board: [] as string[],
        potLabel: "",
        heroHole: null as [string, string] | null,
        maxSeats: DEFAULT_MAX_SEATS,
        showPot: false,
        announce: "",
        handLive: false,
        dealNonce: 0,
        potMinor: 0,
        winnerSeat: -1,
        winNonce: 0,
      };
    }

    const total = Math.min(
      MAX_SEATS,
      Math.max(MIN_SEATS, snapshot.max_seats ?? snapshot.seats.length),
    );
    const heroIdx = heroSeatIndex(snapshot.seats, heroUserId);

    const heroHole: [string, string] | null =
      holeCards.length >= 2 ? [holeCards[0].code, holeCards[1].code] : null;

    const seats: SceneSeat[] = snapshot.seats
      .filter((s) => s.user_id && s.status !== "empty")
      .map((s) => {
        // Rotate seats so the hero sits at bottom-center (scene index 0).
        const sceneIndex = heroIdx >= 0 ? (s.index - heroIdx + total) % total : s.index;
        const state = seatState(s, snapshot, showdown);
        const isHero = s.index === heroIdx;
        return {
          index: sceneIndex,
          name: s.username ?? `Seat ${s.index + 1}`,
          stack: formatCents(s.stack),
          ringColor: ringForState(state),
          state,
          action: actionPill(s),
          hole: isHero && heroHole ? heroHole : undefined,
          avatar: avatarDef(s.user_id || `seat-${s.index}`).id,
          model_url: s.model_url,
          use3d: mode === "3d" || (mode === "mix" && !!s.model_url),
          isBot: !!s.is_bot,
          isButton: s.index === snapshot.button_seat,
          betLabel: (s.bet ?? 0) > 0 ? formatCents(s.bet ?? 0) : undefined,
          betMinor: s.bet ?? 0,
          stackMinor: s.stack ?? 0,
          revealHole: revealedHole(showdown, s.index, s.user_id),
        } satisfies SceneSeat;
      });

    // Transient banner: at showdown, name the top winner, their pot, and the
    // winning hand; the scene shows it as a center-top announcement.
    let announce = "";
    let winnerSeat = -1;
    let winNonce = 0;
    if (showdown?.winners?.length) {
      const top = [...showdown.winners].sort((a, b) => (b.pot ?? 0) - (a.pot ?? 0))[0];
      const name =
        top.username ?? snapshot.seats.find((s) => s.index === top.seat)?.username ?? `Seat ${(top.seat ?? 0) + 1}`;
      const amt = (top.pot ?? 0) > 0 ? ` wins ${formatCents(top.pot ?? 0)}` : " wins";
      announce = `${name}${amt}${top.hand ? ` · ${top.hand}` : ""}`;
      // Map the winner's server seat to the rotated scene index so the pot sweeps
      // to the right spot; nonce changes when a showdown lands so the sweep fires.
      const ws = top.seat ?? -1;
      winnerSeat = ws >= 0 && heroIdx >= 0 ? (ws - heroIdx + total) % total : ws;
      winNonce = (snapshot.hand_no ?? 0) + 1_000_000;
    }

    // A hand is live once dealing starts (not the between-hands "waiting" phase) —
    // used to draw the deck + face-down opponent cards on the felt.
    const handLive =
      (!!snapshot.phase && snapshot.phase !== "waiting") ||
      snapshot.board.length > 0 ||
      snapshot.pot > 0 ||
      heroHole !== null;

    return {
      seats,
      board: snapshot.board.filter((c) => c.face_up).map((c) => c.code),
      potLabel: formatCents(snapshot.pot),
      heroHole,
      maxSeats: total,
      showPot: snapshot.pot > 0,
      announce,
      handLive,
      dealNonce: snapshot.hand_no ?? 0,
      potMinor: snapshot.pot ?? 0,
      winnerSeat,
      winNonce,
    };
  }, [snapshot, holeCards, showdown, heroUserId, mode]);

  // On-felt sit-out toggle + change-seat markers (live, seated hero only). Computed
  // outside the memo so it captures the stable sitOut/moveSeat callbacks.
  const feltControls: FeltControls | undefined = (() => {
    if (demo || !snapshot) return undefined;
    const total = Math.min(MAX_SEATS, Math.max(MIN_SEATS, snapshot.max_seats ?? snapshot.seats.length));
    const heroIdx = heroSeatIndex(snapshot.seats, heroUserId);

    // An UNSEATED viewer used to get no controls at all, which meant the empty seats
    // rendered as inert "VACANT" tiles — a player arriving at a table had nothing to
    // click to sit down and show their avatar. They get sit-down only: no sit-out, no
    // seat-change (both require a seat), and seats are unrotated because the rotation
    // is anchored on the hero.
    if (heroIdx < 0) {
      return {
        heroSittingOut: false,
        canMove: false,
        emptySeats: [],
        onSitOut: () => {},
        onMove: () => {},
        onSit: (idx: number) => setBuyInSeat(idx),
        serverIndexFor: (sceneIndex: number) => sceneIndex,
      };
    }

    const heroSeat = snapshot.seats.find((s) => s.index === heroIdx);
    const canMove = (snapshot.phase ?? "waiting") === "waiting";
    const emptySeats = snapshot.seats
      .filter((s) => s.status === "empty" && s.index < total)
      .map((s) => ({ serverIndex: s.index, sceneIndex: (s.index - heroIdx + total) % total }));
    return {
      heroSittingOut: heroSeat?.sitting_out ?? false,
      canMove,
      emptySeats,
      onSitOut: (on: boolean) => void live.sitOut(on),
      onMove: (idx: number) => void live.moveSeat(idx),
      // Already seated: sitting again is not a thing, so the vacant tiles stay inert
      // and seat CHANGES keep using the existing "Sit here" pill (gated on canMove).
      serverIndexFor: (sceneIndex: number) => (sceneIndex + heroIdx) % total,
    };
  })();

  return (
    <>
      {/* Clicking an empty seat opens the existing two-wallet buy-in dialog, which
          owns the real sitDown() call and the min/max + wallet-balance guards. */}
      {buyInSeat !== null && <BuyInDialog seat={buyInSeat} onClose={() => setBuyInSeat(null)} />}
      <CinematicScene
        seats={scene.seats}
        board={scene.board}
        potLabel={scene.potLabel}
        heroHole={scene.heroHole}
        mode={mode}
        maxSeats={scene.maxSeats}
        showPot={scene.showPot}
        handLive={scene.handLive}
        dealNonce={scene.dealNonce}
        potMinor={scene.potMinor}
        winnerSeat={scene.winnerSeat}
        winNonce={scene.winNonce}
        announce={scene.announce}
        feltControls={feltControls}
        backdrop={bakedPlate(snapshot?.table_art)}
        overlay={
          <>
            <HandHistoryPanel />
            <TableAdminOverlay demo={demo} />
          </>
        }
      />
    </>
  );
}

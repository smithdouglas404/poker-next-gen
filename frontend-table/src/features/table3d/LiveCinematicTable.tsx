"use client";

// Live cinematic table: projects authoritative Nakama game state onto the shared
// prop-driven CinematicScene. The rendered scene is a pure projection of server
// truth (CLAUDE.md non-negotiable #3) — no optimistic values.
//
// ?demo=1 injects a static demo snapshot so the cinematic table renders
// populated without a live server (headless verification / owner review).

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { useRenderMode } from "@/features/table/renderMode";
import { avatarDef } from "@/features/table/avatars";
import { heroSeatIndex } from "@/features/table/syncGameToCanvas";
import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS } from "@/features/game/protocol";
import type { CardView, SeatView, ShowdownMessage, TableSnapshot } from "@/features/game/protocol";
import { CinematicScene, type SceneSeat } from "./CinematicScene";
import { TableAdminOverlay } from "./TableAdminOverlay";
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
      return "#22d3ee";
  }
}

function actionPill(seat: SeatView, snapshot: TableSnapshot): SceneSeat["action"] {
  const last = (seat.last_action ?? "").toLowerCase();
  if (!last) return undefined;
  const bet = snapshot.current_bet ? formatCents(snapshot.current_bet) : undefined;
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
      return { label: "ALL-IN", amount: formatCents(seat.stack), tone: "allin" };
    default:
      return { label: last.toUpperCase(), tone: "call" };
  }
}

export default function LiveCinematicTable() {
  const search = useSearchParams();
  const demo = search.get("demo") === "1";

  const live = useGame();
  const [mode] = useRenderMode();

  const snapshot = demo ? DEMO_SNAPSHOT : live.snapshot;
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
          action: actionPill(s, snapshot),
          hole: isHero && heroHole ? heroHole : undefined,
          avatar: avatarDef(s.user_id || `seat-${s.index}`).id,
          model_url: s.model_url,
          use3d: mode === "3d" || (mode === "mix" && !!s.model_url),
          isBot: !!s.is_bot,
        } satisfies SceneSeat;
      });

    return {
      seats,
      board: snapshot.board.filter((c) => c.face_up).map((c) => c.code),
      potLabel: formatCents(snapshot.pot),
      heroHole,
      maxSeats: total,
      showPot: snapshot.pot > 0,
    };
  }, [snapshot, holeCards, showdown, heroUserId, mode]);

  return (
    <CinematicScene
      seats={scene.seats}
      board={scene.board}
      potLabel={scene.potLabel}
      heroHole={scene.heroHole}
      mode={mode}
      maxSeats={scene.maxSeats}
      showPot={scene.showPot}
      overlay={<TableAdminOverlay demo={demo} />}
    />
  );
}

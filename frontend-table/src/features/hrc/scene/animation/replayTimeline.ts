import gsap from "gsap";
import { useReplayStore } from "@/features/hrc/store/useReplayStore";
import { useGameStore, type ReplayAction } from "@/features/hrc/store/useGameStore";

/**
 * Blueprint Section 11 + 14 Prompt 4 — GSAP-driven replay timeline.
 *
 * Deterministic timeline that can animate:
 * - Street reveals (flop deals with sequential motion, turn/river land with emphasis)
 * - Player turn highlights (acting seat pulses)
 * - Chip movement to pot
 * - Fold state changes (seat dims, cards retract)
 * - Showdown reveals (remaining hands reveal, winner gold highlight)
 * - Winner emphasis (camera subtly tightens — Phase 10)
 *
 * GSAP owns everything inside the R3F Canvas.
 * Framer Motion owns everything outside (panels, overlays, UI transitions).
 */

let masterTimeline: gsap.core.Timeline | null = null;

/**
 * Build a GSAP master timeline from a sequence of replay actions.
 * Each action becomes a labeled position in the timeline.
 */
export function buildReplayTimeline(
  actions: ReplayAction[],
  callbacks: {
    onStreetReveal: (street: string, cards: any[]) => void;
    onSeatHighlight: (seatIndex: number) => void;
    onFold: (seatIndex: number) => void;
    onBet: (seatIndex: number, amount: number) => void;
    onReveal: (seatIndex: number, cards: any[]) => void;
    onWin: (seatIndex: number, amount: number) => void;
    onStepChange: (step: number) => void;
  }
): gsap.core.Timeline {
  // Kill existing timeline
  if (masterTimeline) {
    masterTimeline.kill();
  }

  const tl = gsap.timeline({
    paused: true,
    onComplete: () => {
      useReplayStore.getState().pause();
    },
  });

  let currentTime = 0;
  const stepDuration = 0.8; // seconds per action

  actions.forEach((action, index) => {
    const label = `step-${index}`;
    tl.addLabel(label, currentTime);

    // Callback to update replay store step
    tl.call(() => callbacks.onStepChange(index), [], currentTime + 0.01);

    switch (action.type) {
      case "post_blind":
      case "bet":
      case "raise":
      case "call":
        tl.call(
          () => {
            callbacks.onSeatHighlight(action.actorSeat);
            callbacks.onBet(action.actorSeat, action.amount || 0);
          },
          [],
          currentTime + 0.1
        );
        break;

      case "check":
        tl.call(
          () => callbacks.onSeatHighlight(action.actorSeat),
          [],
          currentTime + 0.1
        );
        break;

      case "fold":
        tl.call(
          () => {
            callbacks.onSeatHighlight(action.actorSeat);
            callbacks.onFold(action.actorSeat);
          },
          [],
          currentTime + 0.1
        );
        break;

      case "reveal":
        if (action.cards) {
          tl.call(
            () => {
              callbacks.onStreetReveal(action.street, action.cards || []);
              if (action.actorSeat >= 0) {
                callbacks.onReveal(action.actorSeat, action.cards || []);
              }
            },
            [],
            currentTime + 0.1
          );
        }
        break;

      case "win":
        tl.call(
          () => callbacks.onWin(action.actorSeat, action.amount || 0),
          [],
          currentTime + 0.1
        );
        break;
    }

    currentTime += stepDuration;
  });

  masterTimeline = tl;
  useReplayStore.getState().setTotalSteps(actions.length);

  return tl;
}

/**
 * Play/pause/seek the master timeline.
 */
export function playTimeline() {
  masterTimeline?.play();
}

export function pauseTimeline() {
  masterTimeline?.pause();
}

export function seekTimeline(step: number) {
  masterTimeline?.seek(`step-${step}`);
}

export function setTimelineSpeed(speed: number) {
  masterTimeline?.timeScale(speed);
}

export function killTimeline() {
  masterTimeline?.kill();
  masterTimeline = null;
}

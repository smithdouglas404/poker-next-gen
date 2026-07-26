import { create } from "zustand";

/**
 * Blueprint Section 7 — replay slice
 * Controls replay playback, timeline position, speed, and focus.
 */

interface ReplayStore {
  isPlaying: boolean;
  speed: number;
  currentStep: number;
  totalSteps: number;
  currentStreet: "pre-flop" | "flop" | "turn" | "river" | "showdown";
  focusedSeat: number;
  focusedEntity: string;
  timelineStatus: "idle" | "playing" | "paused" | "complete";

  // Actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  seekTo: (step: number) => void;
  setCurrentStreet: (
    street: "pre-flop" | "flop" | "turn" | "river" | "showdown"
  ) => void;
  setFocusedSeat: (seat: number) => void;
  setFocusedEntity: (entity: string) => void;
  setTotalSteps: (total: number) => void;
  reset: () => void;
}

const initialState = {
  isPlaying: false,
  speed: 1,
  currentStep: 0,
  totalSteps: 0,
  currentStreet: "pre-flop" as const,
  focusedSeat: -1,
  focusedEntity: "",
  timelineStatus: "idle" as const,
};

export const useReplayStore = create<ReplayStore>((set, get) => ({
  ...initialState,

  play: () => set({ isPlaying: true, timelineStatus: "playing" }),
  pause: () => set({ isPlaying: false, timelineStatus: "paused" }),
  stop: () =>
    set({ isPlaying: false, currentStep: 0, timelineStatus: "idle" }),

  setSpeed: (speed) => set({ speed }),

  stepForward: () =>
    set((state) => {
      const next = Math.min(state.currentStep + 1, state.totalSteps - 1);
      return {
        currentStep: next,
        timelineStatus: next >= state.totalSteps - 1 ? "complete" : state.timelineStatus,
      };
    }),

  stepBackward: () =>
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 0),
    })),

  seekTo: (step) =>
    set((state) => ({
      currentStep: Math.max(0, Math.min(step, state.totalSteps - 1)),
    })),

  setCurrentStreet: (currentStreet) => set({ currentStreet }),
  setFocusedSeat: (focusedSeat) => set({ focusedSeat }),
  setFocusedEntity: (focusedEntity) => set({ focusedEntity }),
  setTotalSteps: (totalSteps) => set({ totalSteps }),

  reset: () => set(initialState),
}));

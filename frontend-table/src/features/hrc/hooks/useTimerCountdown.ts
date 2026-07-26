import { useState, useEffect, useRef, useCallback } from "react";

export interface TimerState {
  /** 0-100 percentage of main timer remaining */
  percent: number;
  /** Seconds left on main timer (0 if expired) */
  secondsLeft: number;
  /** Whether the player has entered personal time bank */
  inTimeBank: boolean;
  /** Seconds remaining in personal time bank */
  timeBankRemaining: number;
  /** Total seconds left (main + time bank) */
  totalSecondsLeft: number;
}

/**
 * Smooth countdown hook that uses requestAnimationFrame for 60fps updates.
 * Works with server turnDeadline (multiplayer) or falls back to timeLeft percentage (offline).
 */
export function useTimerCountdown(
  turnDeadline: number | undefined,
  turnDuration: number,
  timeBankSeconds: number,
  isActive: boolean,
  /** Fallback percentage for offline mode (0-100) */
  fallbackPercent?: number,
): TimerState {
  const [state, setState] = useState<TimerState>({
    percent: 100,
    secondsLeft: turnDuration,
    inTimeBank: false,
    timeBankRemaining: timeBankSeconds,
    totalSecondsLeft: turnDuration + timeBankSeconds,
  });

  const rafRef = useRef<number>(0);
  const activeRef = useRef(isActive);
  activeRef.current = isActive;

  const compute = useCallback((): TimerState => {
    // If we have a server deadline, use it for precise timing
    if (turnDeadline && turnDeadline > 0 && isActive) {
      const now = Date.now();
      const mainRemaining = Math.max(0, (turnDeadline - now) / 1000);
      const mainPercent = turnDuration > 0
        ? Math.max(0, Math.min(100, (mainRemaining / turnDuration) * 100))
        : 0;

      if (mainRemaining > 0) {
        return {
          percent: mainPercent,
          secondsLeft: Math.ceil(mainRemaining),
          inTimeBank: false,
          timeBankRemaining: timeBankSeconds,
          totalSecondsLeft: Math.ceil(mainRemaining + timeBankSeconds),
        };
      } else {
        // Main timer expired — counting down time bank
        const tbUsed = Math.abs(mainRemaining); // how many seconds past deadline
        const tbRemaining = Math.max(0, timeBankSeconds - tbUsed);
        return {
          percent: 0,
          secondsLeft: 0,
          inTimeBank: true,
          timeBankRemaining: Math.ceil(tbRemaining),
          totalSecondsLeft: Math.ceil(tbRemaining),
        };
      }
    }

    // Fallback for offline mode
    if (fallbackPercent !== undefined && isActive) {
      const pct = Math.max(0, Math.min(100, fallbackPercent));
      const secs = Math.ceil((pct / 100) * turnDuration);
      return {
        percent: pct,
        secondsLeft: secs,
        inTimeBank: false,
        timeBankRemaining: timeBankSeconds,
        totalSecondsLeft: secs + timeBankSeconds,
      };
    }

    // Not active
    return {
      percent: 100,
      secondsLeft: turnDuration,
      inTimeBank: false,
      timeBankRemaining: timeBankSeconds,
      totalSecondsLeft: turnDuration + timeBankSeconds,
    };
  }, [turnDeadline, turnDuration, timeBankSeconds, isActive, fallbackPercent]);

  useEffect(() => {
    if (!isActive) {
      setState({
        percent: 100,
        secondsLeft: turnDuration,
        inTimeBank: false,
        timeBankRemaining: timeBankSeconds,
        totalSecondsLeft: turnDuration + timeBankSeconds,
      });
      return;
    }

    let running = true;
    const tick = () => {
      if (!running || !activeRef.current) return;
      setState(compute());
      rafRef.current = requestAnimationFrame(tick);
    };

    // Initial computation
    setState(compute());
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, compute, turnDuration, timeBankSeconds]);

  return state;
}

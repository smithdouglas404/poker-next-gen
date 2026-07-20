"use client";

/**
 * Self-contained poker sound engine.
 *
 * All cues are synthesized at runtime with the Web Audio API (oscillator +
 * gain envelopes) so the feature ships with **zero binary audio assets**.
 * The engine is a browser-only singleton; every entry point guards against
 * SSR by lazily touching `window` / `AudioContext` only inside method bodies.
 *
 * Browser autoplay policies require an AudioContext to be created/resumed from
 * a user gesture — call {@link SoundManager.armGestureInit} once so the context
 * is unlocked on the first interaction.
 */

export type SoundCue =
  | "deal"
  | "check"
  | "bet"
  | "call"
  | "fold"
  | "win"
  | "turn";

const STORAGE_KEY = "poker.sound.muted";

type MuteListener = (muted: boolean) => void;

interface ToneStep {
  freq: number;
  /** start offset in seconds from cue trigger */
  at: number;
  /** duration in seconds */
  dur: number;
  /** peak gain 0..1 */
  gain?: number;
  type?: OscillatorType;
}

/** Envelope recipes for each cue, expressed as one or more short tones. */
const RECIPES: Record<SoundCue, ToneStep[]> = {
  // crisp downward blip — a card sliding onto the felt
  deal: [{ freq: 880, at: 0, dur: 0.07, gain: 0.18, type: "triangle" }],
  // soft double knock on the table
  check: [
    { freq: 300, at: 0, dur: 0.06, gain: 0.22, type: "sine" },
    { freq: 300, at: 0.11, dur: 0.06, gain: 0.22, type: "sine" },
  ],
  // confident rising chirp for a bet / raise / all-in
  bet: [
    { freq: 440, at: 0, dur: 0.09, gain: 0.2, type: "sawtooth" },
    { freq: 660, at: 0.08, dur: 0.11, gain: 0.2, type: "sawtooth" },
  ],
  // single mid chip-clink for a call
  call: [{ freq: 520, at: 0, dur: 0.1, gain: 0.2, type: "square" }],
  // muted downward tone for a fold
  fold: [
    { freq: 330, at: 0, dur: 0.12, gain: 0.18, type: "sine" },
    { freq: 220, at: 0.09, dur: 0.14, gain: 0.16, type: "sine" },
  ],
  // bright ascending arpeggio on showdown win
  win: [
    { freq: 523.25, at: 0, dur: 0.12, gain: 0.2, type: "triangle" },
    { freq: 659.25, at: 0.1, dur: 0.12, gain: 0.2, type: "triangle" },
    { freq: 783.99, at: 0.2, dur: 0.18, gain: 0.22, type: "triangle" },
  ],
  // gentle alert double-beep when it is your turn to act
  turn: [
    { freq: 987.77, at: 0, dur: 0.09, gain: 0.16, type: "sine" },
    { freq: 987.77, at: 0.14, dur: 0.09, gain: 0.16, type: "sine" },
  ],
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private hydrated = false;
  private armed = false;
  private listeners = new Set<MuteListener>();

  /** Read the persisted mute preference (idempotent, browser-only). */
  private hydrate(): void {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* localStorage unavailable — default to unmuted */
    }
  }

  isMuted(): boolean {
    this.hydrate();
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.hydrate();
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore persistence failures */
    }
    this.listeners.forEach((fn) => fn(muted));
  }

  toggleMuted(): boolean {
    this.setMuted(!this.isMuted());
    return this.muted;
  }

  subscribe(fn: MuteListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Create/resume the AudioContext. Safe to call repeatedly. */
  ensureContext(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  /**
   * Install a one-shot gesture listener that unlocks the AudioContext the
   * first time the user interacts with the page. Idempotent.
   */
  armGestureInit(): void {
    if (this.armed || typeof window === "undefined") return;
    this.armed = true;
    const unlock = () => {
      this.ensureContext();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  }

  /** Fire a cue. No-ops when muted, on the server, or before the context unlocks. */
  play(cue: SoundCue): void {
    if (this.isMuted()) return;
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;

    const recipe = RECIPES[cue];
    const now = ctx.currentTime;
    for (const step of recipe) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = step.type ?? "sine";
      osc.frequency.setValueAtTime(step.freq, now + step.at);

      const peak = step.gain ?? 0.2;
      const start = now + step.at;
      const end = start + step.dur;
      // quick attack, exponential-ish decay via linear ramp to ~0
      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, step.dur / 2));
      gainNode.gain.linearRampToValueAtTime(0.0001, end);

      osc.connect(gainNode).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}

/** Process-wide singleton shared by every hook/component. */
export const soundManager = new SoundManager();

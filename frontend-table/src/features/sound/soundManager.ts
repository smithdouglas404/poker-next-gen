"use client";

/**
 * Poker sound engine.
 *
 * Plays high-fidelity SFX files from `/sounds/` (generated via ElevenLabs, harvested
 * from HighRollersClub) with a synthesized Web-Audio fallback so the feature still
 * works if an asset is missing. Cues are also layered with a synthesized clay
 * chip-clink for bet/call texture. The engine is a browser-only singleton; every
 * entry point guards against SSR by lazily touching `window` / `AudioContext` only
 * inside method bodies.
 *
 * Browser autoplay policies require an AudioContext to be created/resumed from a user
 * gesture — call {@link SoundManager.armGestureInit} once so the context is unlocked
 * on the first interaction.
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

/** Audio file (in /sounds/) backing each cue, when present. */
const CUE_FILES: Record<SoundCue, string> = {
  deal: "card-deal",
  check: "check",
  bet: "raise",
  call: "call",
  fold: "fold",
  win: "win",
  turn: "turn-notify",
};

/** Cues that also get a synthesized chip layer for extra texture. */
const CHIP_LAYER: Partial<Record<SoundCue, "clink" | "stack">> = {
  bet: "stack",
  call: "clink",
};

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".webm"];

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

/** Synth fallback recipes for each cue (used when no audio file is loaded). */
const RECIPES: Record<SoundCue, ToneStep[]> = {
  deal: [{ freq: 880, at: 0, dur: 0.07, gain: 0.18, type: "triangle" }],
  check: [
    { freq: 300, at: 0, dur: 0.06, gain: 0.22, type: "sine" },
    { freq: 300, at: 0.11, dur: 0.06, gain: 0.22, type: "sine" },
  ],
  bet: [
    { freq: 440, at: 0, dur: 0.09, gain: 0.2, type: "sawtooth" },
    { freq: 660, at: 0.08, dur: 0.11, gain: 0.2, type: "sawtooth" },
  ],
  call: [{ freq: 520, at: 0, dur: 0.1, gain: 0.2, type: "square" }],
  fold: [
    { freq: 330, at: 0, dur: 0.12, gain: 0.18, type: "sine" },
    { freq: 220, at: 0.09, dur: 0.14, gain: 0.16, type: "sine" },
  ],
  win: [
    { freq: 523.25, at: 0, dur: 0.12, gain: 0.2, type: "triangle" },
    { freq: 659.25, at: 0.1, dur: 0.12, gain: 0.2, type: "triangle" },
    { freq: 783.99, at: 0.2, dur: 0.18, gain: 0.22, type: "triangle" },
  ],
  turn: [
    { freq: 987.77, at: 0, dur: 0.09, gain: 0.16, type: "sine" },
    { freq: 987.77, at: 0.14, dur: 0.09, gain: 0.16, type: "sine" },
  ],
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private hydrated = false;
  private armed = false;
  private listeners = new Set<MuteListener>();

  private buffers = new Map<SoundCue, AudioBuffer>();
  private loadStarted = false;

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

  /** Create/resume the AudioContext + master gain. Safe to call repeatedly. */
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
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        this.masterGain = null;
        return;
      }
      void this.loadFiles();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  /** Fetch + decode the SFX files once the context exists. */
  private async loadFiles(): Promise<void> {
    if (this.loadStarted || !this.ctx) return;
    this.loadStarted = true;
    const ctx = this.ctx;
    await Promise.all(
      (Object.keys(CUE_FILES) as SoundCue[]).map(async (cue) => {
        for (const ext of AUDIO_EXTENSIONS) {
          try {
            const res = await fetch(`/sounds/${CUE_FILES[cue]}${ext}`);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(buf);
            this.buffers.set(cue, decoded);
            return;
          } catch {
            /* try next extension */
          }
        }
      }),
    );
  }

  private get dest(): AudioNode | null {
    return this.masterGain ?? this.ctx?.destination ?? null;
  }

  /**
   * Install a one-shot gesture listener that unlocks the AudioContext the first
   * time the user interacts with the page. Idempotent.
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
    const dest = this.dest;
    if (!ctx || ctx.state !== "running" || !dest) return;

    const buffer = this.buffers.get(cue);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(dest);
      src.start();
    } else {
      this.playSynth(cue, ctx, dest);
    }

    // Layer a synthesized chip sound for bet/call texture.
    const chip = CHIP_LAYER[cue];
    if (chip === "clink") this.synthChipClink(ctx, dest, 0.55);
    else if (chip === "stack") this.synthChipStack(ctx, dest, 4);
  }

  private playSynth(cue: SoundCue, ctx: AudioContext, dest: AudioNode): void {
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
      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, step.dur / 2));
      gainNode.gain.linearRampToValueAtTime(0.0001, end);

      osc.connect(gainNode).connect(dest);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  /** Realistic clay chip clink (3-layer: click + body + gritty noise). */
  private synthChipClink(ctx: AudioContext, dest: AudioNode, volume = 0.6): void {
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(3200 + Math.random() * 800, now);
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
    gain1.gain.setValueAtTime(volume * 0.7, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc1.connect(gain1).connect(dest);
    osc1.start(now);
    osc1.stop(now + 0.07);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(800 + Math.random() * 200, now);
    osc2.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    gain2.gain.setValueAtTime(volume * 0.5, now + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc2.connect(gain2).connect(dest);
    osc2.start(now);
    osc2.stop(now + 0.12);

    const bufferSize = Math.floor(ctx.sampleRate * 0.05);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 4000;
    filter.Q.value = 2;
    noise.connect(filter).connect(noiseGain).connect(dest);
    noise.start(now);
    noise.stop(now + 0.06);
  }

  private synthChipStack(ctx: AudioContext, dest: AudioNode, count = 3): void {
    for (let i = 0; i < count; i++) {
      setTimeout(
        () => this.synthChipClink(ctx, dest, 0.4 + Math.random() * 0.2),
        i * 35 + Math.random() * 15,
      );
    }
  }
}

/** Process-wide singleton shared by every hook/component. */
export const soundManager = new SoundManager();

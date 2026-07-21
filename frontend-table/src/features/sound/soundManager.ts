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
  | "flip"
  | "check"
  | "bet"
  | "call"
  | "fold"
  | "win"
  | "turn"
  | "button"
  | "showdown";

const STORAGE_KEY = "poker.sound.muted";
const PACK_KEY = "poker.sound.pack";

type MuteListener = (muted: boolean) => void;

/**
 * Sound pack. "studio" = fully synthesized (procedural Web-Audio): card sounds
 * are real filtered-noise textures (paper flick / felt slide) and chips are the
 * 3-layer clay-clink model — license-clean and, frankly, better than the stock
 * recorded pack. "recorded" = the ElevenLabs .mp3 files, synth as fallback.
 */
export type SoundPack = "studio" | "recorded";
type PackListener = (pack: SoundPack) => void;

/** Filtered-noise "texture" cues (cards on felt) — realistic, no tones. */
interface NoiseStep {
  dur: number;
  filter: BiquadFilterType;
  freq: number;
  q: number;
  gain: number;
  /** optional filter-frequency sweep target */
  sweepTo?: number;
}

const NOISE_RECIPES: Partial<Record<SoundCue, NoiseStep>> = {
  // Card skimmed across felt to a player — a quick bright flick.
  deal: { dur: 0.08, filter: "bandpass", freq: 2600, q: 0.8, gain: 0.5, sweepTo: 3600 },
  // Community card snapped face-up — sharper, higher.
  flip: { dur: 0.06, filter: "bandpass", freq: 3800, q: 0.9, gain: 0.55, sweepTo: 5200 },
  // Folded cards sliding away — a soft "shhk" that decays downward.
  fold: { dur: 0.2, filter: "lowpass", freq: 1400, q: 0.6, gain: 0.4, sweepTo: 450 },
};

/** Audio file (in /sounds/) backing each cue, when present. Cues without a file
 *  (e.g. the dealer button) fall through to the synth recipe below. */
const CUE_FILES: Partial<Record<SoundCue, string>> = {
  deal: "card-deal",
  flip: "card-flip",
  check: "check",
  bet: "raise",
  call: "call",
  fold: "fold",
  win: "win",
  turn: "turn-notify",
  showdown: "showdown",
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
  // Community card turned over — a quick, brighter snap than the deal blip.
  flip: [{ freq: 1200, at: 0, dur: 0.05, gain: 0.16, type: "triangle" }],
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
  // Dealer button slides to the next seat — a soft woody double-knock (no asset).
  button: [
    { freq: 180, at: 0, dur: 0.05, gain: 0.16, type: "sine" },
    { freq: 140, at: 0.06, dur: 0.06, gain: 0.13, type: "sine" },
  ],
  // Showdown reveal — a rising triad under the card flips.
  showdown: [
    { freq: 392.0, at: 0, dur: 0.1, gain: 0.18, type: "triangle" },
    { freq: 523.25, at: 0.09, dur: 0.1, gain: 0.18, type: "triangle" },
    { freq: 659.25, at: 0.18, dur: 0.16, gain: 0.2, type: "triangle" },
  ],
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private hydrated = false;
  private armed = false;
  private listeners = new Set<MuteListener>();

  private pack: SoundPack = "studio";
  private packHydrated = false;
  private packListeners = new Set<PackListener>();

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

  private hydratePack(): void {
    if (this.packHydrated || typeof window === "undefined") return;
    this.packHydrated = true;
    try {
      this.pack = window.localStorage.getItem(PACK_KEY) === "recorded" ? "recorded" : "studio";
    } catch {
      /* default to studio */
    }
  }

  getPack(): SoundPack {
    this.hydratePack();
    return this.pack;
  }

  setPack(pack: SoundPack): void {
    this.hydratePack();
    this.pack = pack;
    try {
      window.localStorage.setItem(PACK_KEY, pack);
    } catch {
      /* ignore */
    }
    this.packListeners.forEach((fn) => fn(pack));
  }

  subscribePack(fn: PackListener): () => void {
    this.packListeners.add(fn);
    return () => this.packListeners.delete(fn);
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
        const file = CUE_FILES[cue];
        if (!file) return;
        for (const ext of AUDIO_EXTENSIONS) {
          try {
            const res = await fetch(`/sounds/${file}${ext}`);
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

    // Studio pack is fully synthesized; recorded pack uses the .mp3 when loaded.
    const buffer = this.getPack() === "recorded" ? this.buffers.get(cue) : undefined;
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
    // Card/felt cues are filtered noise (realistic), not tones.
    const noise = NOISE_RECIPES[cue];
    if (noise) {
      this.synthNoiseBurst(ctx, dest, noise);
      return;
    }
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

  /** Filtered white-noise burst — the basis of realistic card/felt sounds. */
  private synthNoiseBurst(ctx: AudioContext, dest: AudioNode, step: NoiseStep): void {
    const now = ctx.currentTime;
    const size = Math.max(1, Math.floor(ctx.sampleRate * step.dur));
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = step.filter;
    filter.frequency.setValueAtTime(step.freq, now);
    if (step.sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, step.sweepTo), now + step.dur);
    }
    filter.Q.value = step.q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(step.gain, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + step.dur);

    src.connect(filter).connect(gain).connect(dest);
    src.start(now);
    src.stop(now + step.dur + 0.02);
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

  // ── Voice taunts ───────────────────────────────────────────────────────────

  /**
   * Play a character voice taunt, trying each candidate URL until one loads.
   * Uses a plain HTMLAudio element (no decode) and follows the SFX mute state.
   */
  playTaunt(urls: string[], volume = 0.9): void {
    if (this.isMuted() || typeof window === "undefined" || urls.length === 0) return;
    const tryAt = (i: number) => {
      if (i >= urls.length) return;
      const audio = new Audio(urls[i]);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => tryAt(i + 1));
    };
    tryAt(0);
  }

  // ── Background music ───────────────────────────────────────────────────────

  private bgmAudio: HTMLAudioElement | null = null;
  private bgmUrl = "";
  private bgmVol = 0.35;
  private bgmOn = false;
  private bgmHydrated = false;
  private bgmListeners = new Set<() => void>();

  private hydrateBgm(): void {
    if (this.bgmHydrated || typeof window === "undefined") return;
    this.bgmHydrated = true;
    try {
      this.bgmUrl = window.localStorage.getItem("poker.bgm.url") ?? "";
      const v = window.localStorage.getItem("poker.bgm.vol");
      if (v !== null) this.bgmVol = parseFloat(v);
    } catch {
      /* ignore */
    }
  }

  subscribeBgm(fn: () => void): () => void {
    this.bgmListeners.add(fn);
    return () => this.bgmListeners.delete(fn);
  }

  private emitBgm(): void {
    this.bgmListeners.forEach((fn) => fn());
  }

  getBgmUrl(): string {
    this.hydrateBgm();
    return this.bgmUrl;
  }
  getBgmVolume(): number {
    this.hydrateBgm();
    return this.bgmVol;
  }
  isBgmPlaying(): boolean {
    return this.bgmOn;
  }

  setBgmVolume(v: number): void {
    this.hydrateBgm();
    this.bgmVol = Math.max(0, Math.min(1, v));
    if (this.bgmAudio) this.bgmAudio.volume = this.bgmVol;
    try {
      window.localStorage.setItem("poker.bgm.vol", String(this.bgmVol));
    } catch {
      /* ignore */
    }
    this.emitBgm();
  }

  /** Select a track (URL). Restarts playback if already playing. */
  setBgmTrack(url: string): void {
    this.hydrateBgm();
    this.bgmUrl = url;
    try {
      window.localStorage.setItem("poker.bgm.url", url);
    } catch {
      /* ignore */
    }
    if (this.bgmOn) {
      this.stopBgm();
      if (url) this.playBgm();
    }
    this.emitBgm();
  }

  playBgm(): void {
    this.hydrateBgm();
    if (typeof window === "undefined" || !this.bgmUrl) return;
    if (!this.bgmAudio || this.bgmAudio.src.indexOf(this.bgmUrl) === -1) {
      this.stopBgm();
      this.bgmAudio = new Audio(this.bgmUrl);
      this.bgmAudio.loop = true;
      this.bgmAudio.addEventListener("error", () => {
        this.bgmOn = false;
        this.emitBgm();
      });
    }
    this.bgmAudio.volume = this.bgmVol;
    this.bgmAudio
      .play()
      .then(() => {
        this.bgmOn = true;
        this.emitBgm();
      })
      .catch(() => {
        this.bgmOn = false;
        this.emitBgm();
      });
  }

  stopBgm(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = "";
      this.bgmAudio = null;
    }
    this.bgmOn = false;
    this.emitBgm();
  }

  toggleBgm(): boolean {
    if (this.bgmOn) this.stopBgm();
    else this.playBgm();
    return this.bgmOn;
  }
}

/** Process-wide singleton shared by every hook/component. */
export const soundManager = new SoundManager();

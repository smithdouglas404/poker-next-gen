// Singleton Sound Engine — manages AudioContext + master gain
// Loads high-fidelity audio files from /sounds/ generated via ElevenLabs
// SFX for chips, cards, showdown etc. + BGM player for uploaded music library

const STORAGE_KEY = 'poker-sound-muted';
const VOLUME_KEY = 'poker-sound-volume';
const BGM_URL_KEY = 'poker-bgm-url';
const BGM_VOL_KEY = 'poker-bgm-volume';

// Sound file names in /sounds/ folder (all generated via ElevenLabs)
const SOUND_NAMES = [
  'card-deal', 'card-flip', 'chip-clink', 'chip-slide', 'chip-bet',
  'fold', 'check', 'call', 'raise',
  'phase-reveal', 'showdown', 'win',
  'timer-tick', 'turn-notify', 'countdown',
] as const;
type SoundName = typeof SOUND_NAMES[number];

// Supported audio extensions (tried in order)
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.webm'];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _muted: boolean = false;
  private _volume: number = 0.7;
  private initialized = false;

  // Cached audio buffers from ElevenLabs sound files
  private fileBuffers = new Map<SoundName, AudioBuffer>();
  private fileLoadAttempted = false;

  // BGM (background music from uploaded library)
  private bgmAudio: HTMLAudioElement | null = null;
  private _bgmUrl: string = '';
  private _bgmVolume: number = 0.3;
  private _bgmPlaying: boolean = false;

  constructor() {
    try {
      const storedMuted = localStorage.getItem(STORAGE_KEY);
      if (storedMuted !== null) this._muted = storedMuted === 'true';
      const storedVol = localStorage.getItem(VOLUME_KEY);
      if (storedVol !== null) this._volume = parseFloat(storedVol);
      const storedBgmUrl = localStorage.getItem(BGM_URL_KEY);
      if (storedBgmUrl) this._bgmUrl = storedBgmUrl;
      const storedBgmVol = localStorage.getItem(BGM_VOL_KEY);
      if (storedBgmVol !== null) this._bgmVolume = parseFloat(storedBgmVol);
    } catch {}
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
      // Load ElevenLabs sound files
      this.loadSounds();
    } catch (e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  // --- Sound File Loading ---

  /** Load audio files from /sounds/ folder */
  private async loadSounds() {
    if (this.fileLoadAttempted || !this.ctx) return;
    this.fileLoadAttempted = true;

    for (const name of SOUND_NAMES) {
      for (const ext of AUDIO_EXTENSIONS) {
        try {
          const url = `/sounds/${name}${ext}`;
          const response = await fetch(url, { method: 'HEAD' });
          if (!response.ok) continue;

          const audioResponse = await fetch(url);
          const arrayBuffer = await audioResponse.arrayBuffer();
          const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
          this.fileBuffers.set(name, audioBuffer);
          console.log(`[sound] Loaded: ${name}${ext}`);
          break;
        } catch {
          // Try next extension
        }
      }
    }
  }

  /** Play a loaded audio buffer through the given destination node */
  private playBuffer(buffer: AudioBuffer, dest: AudioNode, volume: number = 1) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    if (volume !== 1) {
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(dest);
    } else {
      source.connect(dest);
    }
    source.start();
  }

  /** Play a sound by name — does nothing if file not loaded */
  private playSound(name: SoundName, volume: number = 1) {
    const d = this.dest;
    if (!d) return;
    const buffer = this.fileBuffers.get(name);
    if (buffer) {
      this.playBuffer(buffer, d, volume);
    }
  }

  /** Play a sound with spatial positioning */
  private playSoundAt(name: SoundName, seatX: number, seatScale: number) {
    const d = this.createSpatialDest(seatX, seatScale);
    if (!d) return;
    const buffer = this.fileBuffers.get(name);
    if (buffer) {
      this.playBuffer(buffer, d);
    }
  }

  private get dest(): AudioNode | null {
    if (!this.ctx || !this.masterGain) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.masterGain;
  }

  get muted() { return this._muted; }

  set muted(val: boolean) {
    this._muted = val;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        val ? 0 : this._volume,
        this.ctx?.currentTime ?? 0
      );
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = val ? 0 : this._bgmVolume;
    }
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch {}
  }

  get volume() { return this._volume; }

  set volume(val: number) {
    this._volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this._muted) {
      this.masterGain.gain.setValueAtTime(this._volume, this.ctx?.currentTime ?? 0);
    }
    try { localStorage.setItem(VOLUME_KEY, String(this._volume)); } catch {}
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  // --- Spatial Audio ---

  private createSpatialDest(seatX: number, seatScale: number): AudioNode | null {
    if (!this.ctx || !this.masterGain) return null;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, (seatX - 50) / 50));
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4 + 0.6 * seatScale;
    panner.connect(gain);
    gain.connect(this.masterGain);
    setTimeout(() => { try { panner.disconnect(); gain.disconnect(); } catch {} }, 5000);
    return panner;
  }

  playChipClinkAt(seatX: number, seatScale: number) {
    const d = this.createSpatialDest(seatX, seatScale);
    if (!d) return;
    this.synthChipClink(d, 0.5 + seatScale * 0.3);
  }

  playFoldAt(seatX: number, seatScale: number) {
    this.playSoundAt('fold', seatX, seatScale);
  }

  playCheckAt(seatX: number, seatScale: number) {
    this.playSoundAt('check', seatX, seatScale);
  }

  playCallAt(seatX: number, seatScale: number) {
    this.playSoundAt('call', seatX, seatScale);
  }

  playRaiseAt(seatX: number, seatScale: number) {
    this.playSoundAt('raise', seatX, seatScale);
  }

  // --- Adaptive Music stubs (removed — using uploaded music library instead) ---

  startAdaptiveMusic() {}
  stopAdaptiveMusic() {}
  setMusicState(_state: "idle" | "in_hand" | "all_in" | "showdown", _opts?: { potSize?: number; blindLevel?: number }) {}

  // --- Synthesized chip sound (realistic clay chip clinking) ---

  private synthChipClink(dest: AudioNode, volume: number = 0.6) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Layer 1: Initial impact — bright metallic click
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(3200 + Math.random() * 800, now);
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
    gain1.gain.setValueAtTime(volume * 0.7, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc1.connect(gain1).connect(dest);
    osc1.start(now);
    osc1.stop(now + 0.07);

    // Layer 2: Body resonance — lower thunk of clay/ceramic
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(800 + Math.random() * 200, now);
    osc2.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    gain2.gain.setValueAtTime(volume * 0.5, now + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc2.connect(gain2).connect(dest);
    osc2.start(now);
    osc2.stop(now + 0.12);

    // Layer 3: Noise burst for texture (the "gritty" chip surface)
    const bufferSize = this.ctx.sampleRate * 0.05;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    // Bandpass filter to shape noise like ceramic
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4000;
    filter.Q.value = 2;
    noise.connect(filter).connect(noiseGain).connect(dest);
    noise.start(now);
    noise.stop(now + 0.06);
  }

  private synthChipStack(dest: AudioNode, count: number = 3) {
    // Multiple chip clinks in rapid succession (like stacking/sliding chips)
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.synthChipClink(dest, 0.4 + Math.random() * 0.2), i * 35 + Math.random() * 15);
    }
  }

  // --- Direct (non-spatial) sound effects ---

  playCardDeal() { this.playSound('card-deal'); }
  playCardFlip() { this.playSound('card-flip'); }
  playChipClink() {
    const d = this.dest;
    if (!d) return;
    // Use synthesized chip if no file loaded, or always use synth for richer sound
    this.synthChipClink(d, 0.6);
  }
  playChipSlide() {
    const d = this.dest;
    if (!d) return;
    this.synthChipStack(d, 4 + Math.floor(Math.random() * 3));
  }
  playFold() { this.playSound('fold'); }
  playCheck() { this.playSound('check'); }
  playCall() { this.playSound('call'); }
  playRaise() { this.playSound('raise'); }
  playPhaseReveal() { this.playSound('phase-reveal'); }
  playShowdownFanfare() { this.playSound('showdown'); }
  playWinCelebration() { this.playSound('win'); }
  playTimerTick(urgency: number = 0) { this.playSound('timer-tick', 0.5 + urgency * 0.5); }
  playTurnNotify() { this.playSound('turn-notify'); }
  playCountdown() { this.playSound('countdown'); }

  startAmbient() {
    // Ambient handled by BGM system now
  }

  stopAmbient() {
    // Ambient handled by BGM system now
  }

  // --- Background Music (uploaded library + custom uploads) ---

  get bgmUrl() { return this._bgmUrl; }
  get bgmVolume() { return this._bgmVolume; }
  get bgmPlaying() { return this._bgmPlaying; }

  setBgmUrl(url: string) {
    this._bgmUrl = url;
    try { localStorage.setItem(BGM_URL_KEY, url); } catch {}

    if (this._bgmPlaying) {
      this.stopBgm();
      if (url) this.playBgm();
    }
  }

  setBgmVolume(val: number) {
    this._bgmVolume = Math.max(0, Math.min(1, val));
    if (this.bgmAudio && !this._muted) {
      this.bgmAudio.volume = this._bgmVolume;
    }
    try { localStorage.setItem(BGM_VOL_KEY, String(this._bgmVolume)); } catch {}
  }

  playBgm() {
    if (!this._bgmUrl) return;

    if (!this.bgmAudio || this.bgmAudio.src !== this._bgmUrl) {
      this.stopBgm();
      this.bgmAudio = new Audio(this._bgmUrl);
      this.bgmAudio.crossOrigin = 'anonymous';
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this._muted ? 0 : this._bgmVolume;

      this.bgmAudio.addEventListener('error', () => {
        console.warn('BGM failed to load:', this._bgmUrl);
        this._bgmPlaying = false;
      });
    }

    this.bgmAudio.volume = this._muted ? 0 : this._bgmVolume;
    this.bgmAudio.play().then(() => {
      this._bgmPlaying = true;
    }).catch((e) => {
      console.warn('BGM play failed:', e);
      this._bgmPlaying = false;
    });
  }

  stopBgm() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
      this.bgmAudio = null;
    }
    this._bgmPlaying = false;
  }

  toggleBgm(): boolean {
    if (this._bgmPlaying) {
      this.stopBgm();
    } else {
      this.playBgm();
    }
    return this._bgmPlaying;
  }
}

// Singleton export
export const soundEngine = new SoundEngine();

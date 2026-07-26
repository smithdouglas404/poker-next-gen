// Adaptive Music Engine — rich game-state-aware ambient music
// Uses layered synthesis with chord progressions, arpeggios, and reverb

type MusicState = "idle" | "in_hand" | "all_in" | "showdown";

// Musical constants (A minor / cinematic)
const NOTES = {
  A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0,
  A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
  A4: 440.0, C5: 523.25, E5: 659.25,
};

// Chord progressions (Am → F → C → G)
const CHORD_PROGRESSION = [
  [NOTES.A2, NOTES.C3, NOTES.E3],    // Am
  [NOTES.F3, NOTES.A3, NOTES.C4],    // F
  [NOTES.C3, NOTES.E3, NOTES.G3],    // C
  [NOTES.G3, NOTES.D3, NOTES.G3],    // G (omit 3rd for power chord feel)
];

// Arpeggio patterns per chord
const ARPEGGIO_PROGRESSION = [
  [NOTES.A3, NOTES.C4, NOTES.E4, NOTES.A4],   // Am
  [NOTES.F3, NOTES.A3, NOTES.C4, NOTES.F4],   // F
  [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.C5],   // C
  [NOTES.G3, NOTES.D4, NOTES.G4, NOTES.D4],   // G
];

export class AdaptiveMusicEngine {
  private ctx: AudioContext;
  private dest: AudioNode;
  private state: MusicState = "idle";
  private running = false;

  // Master mixer
  private masterGain: GainNode | null = null;

  // Pad layer: warm filtered chords
  private padOscs: OscillatorNode[] = [];
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;

  // Arpeggio layer: gentle arpeggiated notes
  private arpGain: GainNode | null = null;
  private arpTimer: ReturnType<typeof setInterval> | null = null;
  private arpIndex = 0;
  private chordIndex = 0;
  private chordTimer: ReturnType<typeof setInterval> | null = null;

  // Sub-bass layer: deep foundation
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;

  // Shimmer layer: high reverb-like texture
  private shimmerGain: GainNode | null = null;
  private shimmerTimer: ReturnType<typeof setInterval> | null = null;

  // Tension layer: filtered noise for suspense
  private tensionSource: AudioBufferSourceNode | null = null;
  private tensionFilter: BiquadFilterNode | null = null;
  private tensionGain: GainNode | null = null;

  // Delay-based reverb
  private reverbGain: GainNode | null = null;
  private delayNodes: DelayNode[] = [];
  private feedbackGains: GainNode[] = [];

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  private createReverb(): GainNode {
    const ctx = this.ctx;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;

    // Multi-tap delay for reverb-like effect
    const delays = [0.037, 0.079, 0.113, 0.151];
    const feedbacks = [0.4, 0.35, 0.3, 0.25];

    delays.forEach((time, i) => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = time;

      const fb = ctx.createGain();
      fb.gain.value = feedbacks[i];

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2000;

      wet.connect(delay);
      delay.connect(filter);
      filter.connect(fb);
      fb.connect(delay); // feedback loop
      filter.connect(this.dest);

      this.delayNodes.push(delay);
      this.feedbackGains.push(fb);
    });

    this.reverbGain = wet;
    return wet;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const t = this.ctx.currentTime;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, t);
    this.masterGain.gain.linearRampToValueAtTime(1, t + 2);
    this.masterGain.connect(this.dest);

    // Create reverb send
    const reverb = this.createReverb();

    // ── Pad layer: warm filtered chord ──
    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0.025, t);

    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.setValueAtTime(400, t);
    this.padFilter.Q.value = 1;

    // LFO on filter cutoff for movement
    const padLfo = this.ctx.createOscillator();
    padLfo.type = "sine";
    padLfo.frequency.value = 0.08;
    const padLfoGain = this.ctx.createGain();
    padLfoGain.gain.value = 150;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(this.padFilter.frequency);
    padLfo.start(t);

    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.masterGain);
    this.padGain.connect(reverb);

    // Start initial chord
    this.startPadChord(0);

    // ── Sub-bass layer ──
    this.subGain = this.ctx.createGain();
    this.subGain.gain.setValueAtTime(0.03, t);
    this.subGain.connect(this.masterGain);

    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = "sine";
    this.subOsc.frequency.setValueAtTime(CHORD_PROGRESSION[0][0], t);
    this.subOsc.connect(this.subGain);
    this.subOsc.start(t);

    // ── Arpeggio layer ──
    this.arpGain = this.ctx.createGain();
    this.arpGain.gain.setValueAtTime(0, t); // starts silent, enabled in "in_hand"
    this.arpGain.connect(this.masterGain);
    this.arpGain.connect(reverb);

    // ── Shimmer layer (high sparkle texture) ──
    this.shimmerGain = this.ctx.createGain();
    this.shimmerGain.gain.setValueAtTime(0, t);
    this.shimmerGain.connect(reverb);

    // ── Tension layer (noise) ──
    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.setValueAtTime(0, t);
    this.tensionGain.connect(this.masterGain);

    this.tensionFilter = this.ctx.createBiquadFilter();
    this.tensionFilter.type = "bandpass";
    this.tensionFilter.frequency.setValueAtTime(2000, t);
    this.tensionFilter.Q.setValueAtTime(3, t);
    this.tensionFilter.connect(this.tensionGain);

    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.tensionSource = this.ctx.createBufferSource();
    this.tensionSource.buffer = noiseBuffer;
    this.tensionSource.loop = true;
    this.tensionSource.connect(this.tensionFilter);
    this.tensionSource.start(t);

    // ── Chord progression timer (change every 4 seconds) ──
    this.chordIndex = 0;
    this.chordTimer = setInterval(() => {
      if (!this.running) return;
      this.chordIndex = (this.chordIndex + 1) % CHORD_PROGRESSION.length;
      this.transitionChord(this.chordIndex);
    }, 4000);

    // ── Arpeggio timer (play notes at ~200ms intervals) ──
    this.arpIndex = 0;
    this.arpTimer = setInterval(() => {
      if (!this.running) return;
      this.playArpNote();
    }, 220);

    // ── Shimmer timer ──
    this.shimmerTimer = setInterval(() => {
      if (!this.running) return;
      this.playShimmer();
    }, 1500);
  }

  private startPadChord(chordIdx: number) {
    // Stop existing pad oscillators
    for (const osc of this.padOscs) {
      try { osc.stop(); } catch {}
    }
    this.padOscs = [];

    const chord = CHORD_PROGRESSION[chordIdx];
    const t = this.ctx.currentTime;

    for (const freq of chord) {
      // Main osc
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(this.padFilter!);
      osc.start(t);
      this.padOscs.push(osc);

      // Detuned copy for width
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(freq * 1.003, t);
      osc2.connect(this.padFilter!);
      osc2.start(t);
      this.padOscs.push(osc2);
    }
  }

  private transitionChord(chordIdx: number) {
    if (!this.running || !this.padFilter) return;
    const t = this.ctx.currentTime;

    // Briefly dip pad volume for smooth transition
    this.padGain?.gain.setValueAtTime(this.padGain.gain.value, t);
    this.padGain?.gain.linearRampToValueAtTime(0.005, t + 0.15);

    setTimeout(() => {
      if (!this.running) return;
      this.startPadChord(chordIdx);
      const now = this.ctx.currentTime;
      this.padGain?.gain.setValueAtTime(0.005, now);
      this.padGain?.gain.linearRampToValueAtTime(
        this.state === "idle" ? 0.025 : this.state === "in_hand" ? 0.015 : 0,
        now + 0.3
      );
    }, 180);

    // Update sub-bass root note
    const root = CHORD_PROGRESSION[chordIdx][0];
    this.subOsc?.frequency.linearRampToValueAtTime(root, t + 0.3);
  }

  private playArpNote() {
    if (!this.running || !this.arpGain) return;
    if (this.arpGain.gain.value < 0.001) return; // skip if layer is silent

    const chord = ARPEGGIO_PROGRESSION[this.chordIndex];
    const freq = chord[this.arpIndex % chord.length];
    this.arpIndex = (this.arpIndex + 1) % chord.length;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, t);
    noteGain.gain.linearRampToValueAtTime(0.06, t + 0.01);
    noteGain.gain.setValueAtTime(0.06, t + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(noteGain);
    noteGain.connect(this.arpGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private playShimmer() {
    if (!this.running || !this.shimmerGain) return;
    if (this.shimmerGain.gain.value < 0.001) return;

    const chord = ARPEGGIO_PROGRESSION[this.chordIndex];
    // Pick a high note from the chord and octave up
    const baseFreq = chord[Math.floor(Math.random() * chord.length)];
    const freq = baseFreq * 2; // one octave up

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, t);
    noteGain.gain.linearRampToValueAtTime(0.02, t + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    osc.connect(noteGain);
    noteGain.connect(this.shimmerGain);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    // Clear timers
    if (this.chordTimer) { clearInterval(this.chordTimer); this.chordTimer = null; }
    if (this.arpTimer) { clearInterval(this.arpTimer); this.arpTimer = null; }
    if (this.shimmerTimer) { clearInterval(this.shimmerTimer); this.shimmerTimer = null; }

    // Stop oscillators
    for (const osc of this.padOscs) {
      try { osc.stop(); } catch {}
    }
    this.padOscs = [];
    try { this.subOsc?.stop(); } catch {}
    try { this.tensionSource?.stop(); } catch {}

    // Disconnect gains
    const nodes: (AudioNode | null)[] = [
      this.padGain, this.padFilter, this.subGain, this.arpGain,
      this.shimmerGain, this.tensionGain, this.tensionFilter,
      this.masterGain, this.reverbGain,
    ];
    for (const n of nodes) {
      try { n?.disconnect(); } catch {}
    }
    for (const d of this.delayNodes) {
      try { d.disconnect(); } catch {}
    }
    for (const f of this.feedbackGains) {
      try { f.disconnect(); } catch {}
    }

    this.delayNodes = [];
    this.feedbackGains = [];
    this.padGain = this.padFilter = null;
    this.subOsc = this.subGain = null;
    this.arpGain = null;
    this.shimmerGain = null;
    this.tensionSource = this.tensionFilter = this.tensionGain = null;
    this.masterGain = this.reverbGain = null;
  }

  setState(state: MusicState, opts?: { potSize?: number; blindLevel?: number }) {
    if (!this.running || state === this.state) return;
    this.state = state;
    const t = this.ctx.currentTime;

    switch (state) {
      case "idle":
        // Gentle pad + sub, no arp, light shimmer
        this.padGain?.gain.linearRampToValueAtTime(0.025, t + 1);
        this.padFilter?.frequency.linearRampToValueAtTime(400, t + 1);
        this.subGain?.gain.linearRampToValueAtTime(0.03, t + 1);
        this.arpGain?.gain.linearRampToValueAtTime(0, t + 0.5);
        this.shimmerGain?.gain.linearRampToValueAtTime(0.015, t + 1);
        this.tensionGain?.gain.linearRampToValueAtTime(0, t + 0.5);
        break;

      case "in_hand": {
        // Pad quieter, arp comes in, shimmer active
        this.padGain?.gain.linearRampToValueAtTime(0.015, t + 0.5);
        this.padFilter?.frequency.linearRampToValueAtTime(600, t + 0.5);
        this.subGain?.gain.linearRampToValueAtTime(0.025, t + 0.5);
        this.arpGain?.gain.linearRampToValueAtTime(0.08, t + 1);
        this.shimmerGain?.gain.linearRampToValueAtTime(0.025, t + 1);
        this.tensionGain?.gain.linearRampToValueAtTime(0, t + 0.5);
        break;
      }

      case "all_in":
        // Dramatic: everything drops, then tension swells
        this.padGain?.gain.linearRampToValueAtTime(0, t + 0.5);
        this.subGain?.gain.linearRampToValueAtTime(0.04, t + 0.5);
        this.arpGain?.gain.linearRampToValueAtTime(0, t + 0.3);
        this.shimmerGain?.gain.linearRampToValueAtTime(0, t + 0.3);
        // Tension swells after pause
        setTimeout(() => {
          if (this.state !== "all_in" || !this.running) return;
          const now = this.ctx.currentTime;
          this.tensionGain?.gain.linearRampToValueAtTime(0.025, now + 2);
          this.tensionFilter?.frequency.linearRampToValueAtTime(1500, now + 2);
          // Sub-bass gets ominous
          this.subGain?.gain.linearRampToValueAtTime(0.05, now + 2);
        }, 800);
        break;

      case "showdown":
        // Silence for fanfare
        this.padGain?.gain.linearRampToValueAtTime(0, t + 0.3);
        this.subGain?.gain.linearRampToValueAtTime(0, t + 0.3);
        this.arpGain?.gain.linearRampToValueAtTime(0, t + 0.2);
        this.shimmerGain?.gain.linearRampToValueAtTime(0, t + 0.2);
        this.tensionGain?.gain.linearRampToValueAtTime(0, t + 0.3);
        break;
    }
  }
}

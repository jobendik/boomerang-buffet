/**
 * Tiny WebAudio synth. All sound effects are generated procedurally so the
 * game ships with zero audio assets. Must be `unlock()`-ed from a user gesture.
 */

interface AudioSys {
  ac: AudioContext | null;
  master: GainNode | null;
  muted: boolean;
  unlock(): void;
  toggleMute(): void;
  beep(freq: number, dur: number, type?: OscillatorType, vol?: number, slideTo?: number | null): void;
  noise(dur: number, vol?: number, hp?: number): void;
  throw_(): void;
  catch_(): void;
  slice(): void;
  dash(): void;
  parry(): void;
  power(): void;
  bomb(): void;
  freeze(): void;
  win(): void;
  tick(): void;
}

export const audio: AudioSys = {
  ac: null,
  master: null,
  muted: false,

  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new Ctx();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ac.destination);
    } catch {
      this.ac = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },

  beep(freq, dur, type = 'square', vol = 0.4, slideTo = null) {
    if (!this.ac || !this.master || this.muted) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.5, hp = 800) {
    if (!this.ac || !this.master || this.muted) return;
    const t = this.ac.currentTime;
    const n = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ac.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  },

  throw_() {
    this.beep(620, 0.12, 'sawtooth', 0.18, 280);
  },
  catch_() {
    this.beep(880, 0.06, 'square', 0.22, 1320);
  },
  slice() {
    this.noise(0.18, 0.55, 1200);
    this.beep(180, 0.18, 'square', 0.2, 70);
  },
  dash() {
    this.noise(0.14, 0.25, 2000);
  },
  parry() {
    this.beep(1200, 0.08, 'square', 0.3, 1900);
    this.beep(1700, 0.1, 'triangle', 0.18, 900);
  },
  power() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.22), i * 55));
  },
  bomb() {
    this.noise(0.3, 0.6, 200);
    this.beep(90, 0.32, 'sawtooth', 0.3, 50);
  },
  freeze() {
    this.beep(440, 0.18, 'sine', 0.2, 1100);
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.beep(f, 0.14, 'triangle', 0.25), i * 90));
  },
  tick() {
    this.beep(420, 0.05, 'square', 0.15);
  },
};

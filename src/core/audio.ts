/**
 * Sample-based WebAudio engine. Every effect is a real recorded sound (see
 * AUDIO_CREDITS.md) bundled as a small MP3 under `src/assets/audio/` and
 * decoded into an AudioBuffer on `unlock()` (which must come from a user
 * gesture). Playback adds per-event gain staging, random round-robin
 * variations, pitch jitter, retrigger gating and voice caps so even the
 * densest brawl stays punchy instead of turning to mush.
 *
 * Three music beds (menu / game / podium) live on their own bus with a
 * lowpass "underwater" duck while the game is paused.
 */

/* Every mp3 under assets/audio, resolved to a served URL at build time.
 * Files are named `<event>_<n>.mp3` — the numeric suffix groups variations
 * of one logical event (slice_1..slice_4 → random pick per kill). */
const FILES = import.meta.glob('../assets/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

interface EventCfg {
  vol: number; // gain relative to the SFX bus
  jitter: number; // ± random playbackRate spread (0.06 = ±6%)
  gap: number; // min ms between retriggers (spam guard)
  voices: number; // max simultaneous instances
}

const CFG: Record<string, EventCfg> = {
  throw: { vol: 0.8, jitter: 0.06, gap: 60, voices: 4 },
  throwbig: { vol: 0.9, jitter: 0.05, gap: 60, voices: 3 },
  catch: { vol: 0.8, jitter: 0.08, gap: 50, voices: 4 },
  slash: { vol: 0.75, jitter: 0.07, gap: 50, voices: 4 },
  dash: { vol: 0.55, jitter: 0.08, gap: 60, voices: 4 },
  jump: { vol: 0.7, jitter: 0.06, gap: 80, voices: 4 },
  land: { vol: 0.45, jitter: 0.07, gap: 60, voices: 3 },
  step: { vol: 0.22, jitter: 0.12, gap: 70, voices: 3 },
  slice: { vol: 0.95, jitter: 0.05, gap: 40, voices: 5 },
  bigkill: { vol: 0.9, jitter: 0, gap: 400, voices: 2 },
  parry: { vol: 0.85, jitter: 0.06, gap: 60, voices: 3 },
  shield: { vol: 0.85, jitter: 0.04, gap: 100, voices: 2 },
  power: { vol: 0.8, jitter: 0.04, gap: 90, voices: 3 },
  golden: { vol: 0.85, jitter: 0.04, gap: 150, voices: 2 },
  freeze: { vol: 0.8, jitter: 0.05, gap: 100, voices: 3 },
  shatter: { vol: 0.9, jitter: 0.05, gap: 60, voices: 3 },
  crack: { vol: 0.6, jitter: 0.1, gap: 70, voices: 3 },
  bomb: { vol: 0.95, jitter: 0.06, gap: 50, voices: 4 },
  ignite: { vol: 0.7, jitter: 0.06, gap: 120, voices: 3 },
  fall: { vol: 0.8, jitter: 0.04, gap: 150, voices: 2 },
  crush: { vol: 0.95, jitter: 0.04, gap: 100, voices: 2 },
  bounce: { vol: 0.5, jitter: 0.12, gap: 55, voices: 5 },
  portal: { vol: 0.65, jitter: 0.06, gap: 90, voices: 3 },
  warp: { vol: 0.85, jitter: 0.04, gap: 120, voices: 2 },
  pop: { vol: 0.7, jitter: 0.08, gap: 60, voices: 4 },
  switch: { vol: 0.6, jitter: 0.06, gap: 90, voices: 3 },
  gate: { vol: 0.55, jitter: 0.05, gap: 200, voices: 2 },
  charge: { vol: 0.7, jitter: 0.02, gap: 200, voices: 2 },
  streak: { vol: 0.85, jitter: 0, gap: 250, voices: 2 },
  hurry: { vol: 0.8, jitter: 0, gap: 500, voices: 1 },
  sudden: { vol: 0.9, jitter: 0, gap: 500, voices: 1 },
  heartbeat: { vol: 0.8, jitter: 0.03, gap: 150, voices: 2 },
  pip: { vol: 0.7, jitter: 0, gap: 100, voices: 2 },
  fight: { vol: 0.95, jitter: 0.02, gap: 300, voices: 1 },
  respawn: { vol: 0.6, jitter: 0.03, gap: 300, voices: 2 },
  roundwin: { vol: 0.8, jitter: 0, gap: 500, voices: 1 },
  matchwin: { vol: 0.9, jitter: 0, gap: 500, voices: 1 },
  matchlose: { vol: 0.85, jitter: 0, gap: 500, voices: 1 },
  uiclick: { vol: 0.7, jitter: 0.03, gap: 60, voices: 3 },
  uihover: { vol: 0.3, jitter: 0.05, gap: 60, voices: 3 },
  uiback: { vol: 0.7, jitter: 0.03, gap: 60, voices: 2 },
  pausein: { vol: 0.7, jitter: 0, gap: 100, voices: 1 },
  pauseout: { vol: 0.7, jitter: 0, gap: 100, voices: 1 },
};

/** Logical screen width, for stereo placement (kept local: no game imports). */
const PAN_W = 1024;

const MUSIC_VOL = 0.4; // music bus level relative to master
const MUTE_KEY = 'boomerang-buffet-muted';

type MusicName = 'menu' | 'game' | 'podium';

interface MusicChannel {
  src: AudioBufferSourceNode;
  gain: GainNode;
  name: MusicName;
}

/* url table: event key → list of variation URLs (sorted for stable order) */
const urls = new Map<string, string[]>();
for (const path of Object.keys(FILES).sort()) {
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.mp3$/, '');
  const m = /^(.+)_(\d+)$/.exec(base);
  const key = m ? m[1] : base; // music_menu has no numeric suffix → keeps full name
  let list = urls.get(key);
  if (!list) urls.set(key, (list = []));
  list.push(FILES[path]);
}

class AudioEngine {
  ac: AudioContext | null = null;
  muted = false;
  /**
   * Where on screen (logical x) the entity currently being simulated sits.
   * The update loop sets this before each fighter/boomerang steps, so every
   * sound they trigger is placed in the stereo field without threading
   * coordinates through each call. `null` = centred (UI, global stingers).
   */
  emitX: number | null = null;

  private master: GainNode | null = null; // everything
  private sfxBus: GainNode | null = null; // one-shots
  private musicBus: GainNode | null = null; // music beds (post-lowpass)
  private musicLP: BiquadFilterNode | null = null; // pause "underwater" duck
  private buffers = new Map<string, AudioBuffer[]>();
  private lastAt = new Map<string, number>(); // retrigger gates (ms clock)
  private lastVar = new Map<string, number>(); // avoid repeating a variation
  private voices = new Map<string, number>();
  private current: MusicChannel | null = null;
  private desiredMusic: MusicName | null = 'menu';
  private ducked = false;
  private musicRate = 1; // last tempo sent to the bed (see setMusicMood)
  private musicCut = 20000; // last lowpass cutoff sent to the bed
  private chargeOsc: OscillatorNode | null = null; // the rising charge whine
  private chargeGain: GainNode | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable — default unmuted */
    }
  }

  /** Create the context and start decoding assets. Must be user-gesture-driven. */
  unlock(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new Ctx();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ac.destination);
      this.sfxBus = this.ac.createGain();
      this.sfxBus.connect(this.master);
      this.musicLP = this.ac.createBiquadFilter();
      this.musicLP.type = 'lowpass';
      this.musicLP.frequency.value = 20000;
      this.musicBus = this.ac.createGain();
      this.musicBus.gain.value = MUSIC_VOL;
      this.musicBus.connect(this.musicLP);
      this.musicLP.connect(this.master);
      void this.loadAll();
    } catch {
      this.ac = null;
    }
  }

  private async loadAll(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const [key, list] of urls) {
      const decoded: AudioBuffer[] = new Array(list.length);
      this.buffers.set(key, decoded);
      list.forEach((url, i) => {
        jobs.push(
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((ab) => this.ac!.decodeAudioData(ab))
            .then((buf) => {
              decoded[i] = buf;
              // the moment the desired bed finishes decoding, fade it in
              if (key.startsWith('music_')) this.syncMusic();
            })
            .catch(() => undefined) // a missing/corrupt file just stays silent
        );
      });
    }
    await Promise.all(jobs);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master && this.ac) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ac.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* fine */
    }
  }

  /** Core one-shot playback with variation pick, jitter, gating and caps. */
  private play(key: string, vol = 1, rate = 1): void {
    if (!this.ac || !this.sfxBus || this.muted) return;
    const cfg = CFG[key];
    const bank = this.buffers.get(key);
    if (!cfg || !bank || !bank.length) return;
    const now = performance.now();
    if (now - (this.lastAt.get(key) ?? -Infinity) < cfg.gap) return;
    if ((this.voices.get(key) ?? 0) >= cfg.voices) return;

    // pick a variation, never the same one twice in a row
    let idx = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && idx === this.lastVar.get(key)) idx = (idx + 1) % bank.length;
    const buf = bank[idx];
    if (!buf) return; // still decoding
    this.lastVar.set(key, idx);
    this.lastAt.set(key, now);

    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * cfg.jitter);
    const g = this.ac.createGain();
    g.gain.value = cfg.vol * vol;
    src.connect(g);
    this.out(g);
    this.voices.set(key, (this.voices.get(key) ?? 0) + 1);
    src.onended = () => {
      this.voices.set(key, Math.max(0, (this.voices.get(key) ?? 1) - 1));
      g.disconnect();
    };
    src.start();
  }

  /** Route a voice to the SFX bus, panned to the current emitter position. */
  private out(node: AudioNode): void {
    if (!this.ac || !this.sfxBus) return;
    if (this.emitX !== null && typeof this.ac.createStereoPanner === 'function') {
      const pan = this.ac.createStereoPanner();
      pan.pan.value = Math.max(-0.75, Math.min(0.75, (this.emitX / PAN_W - 0.5) * 1.5));
      node.connect(pan);
      pan.connect(this.sfxBus);
    } else {
      node.connect(this.sfxBus);
    }
  }

  /**
   * A tiny synth voice for the events no sample covers: one oscillator
   * gliding f0 → f1 under a fast-attack, exponential-decay envelope. Kept
   * deliberately simple (and quiet) — it seasons the sample mix, never leads.
   */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ac || !this.sfxBus || this.muted) return;
    const t0 = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    this.out(g);
    osc.onended = () => g.disconnect();
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* ------------------------------- music ---------------------------------- */

  /** Request a music bed; switches with a short crossfade. `null` stops it. */
  music(name: MusicName | null): void {
    this.desiredMusic = name;
    this.syncMusic();
  }

  private syncMusic(): void {
    if (!this.ac || !this.musicBus) return;
    const want = this.desiredMusic;
    if (this.current && this.current.name === want) return;
    // fade out whatever is playing
    if (this.current) {
      const { src, gain } = this.current;
      gain.gain.setTargetAtTime(0, this.ac.currentTime, 0.25);
      src.stop(this.ac.currentTime + 1.2);
      this.current = null;
    }
    if (!want) return;
    const bank = this.buffers.get(`music_${want}`);
    const buf = bank && bank[0];
    if (!buf) return; // not decoded yet — syncMusic() re-runs when it lands
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // skip the encoder padding at the edges so the loop seam stays clean
    src.loopStart = 0.05;
    src.loopEnd = buf.duration - 0.06;
    const gain = this.ac.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, this.ac.currentTime, 0.5);
    src.connect(gain);
    gain.connect(this.musicBus);
    src.start(this.ac.currentTime, 0.05);
    this.musicRate = 1;
    this.current = { src, gain, name: want };
  }

  /**
   * Let the music breathe with the match. `rate` nudges the bed's tempo (a
   * hair quicker in a showdown, quicker still under sudden death, sagging
   * during a finishing slow-mo) and `cutoff` closes a lowpass for the
   * bullet-time "underwater" dip. Cheap to call every frame — it only talks
   * to the audio graph when a target actually changes.
   */
  setMusicMood(rate: number, cutoff: number): void {
    if (!this.ac || !this.musicLP || this.ducked) return;
    if (this.current && Math.abs(rate - this.musicRate) > 0.004) {
      this.musicRate = rate;
      this.current.src.playbackRate.setTargetAtTime(rate, this.ac.currentTime, 0.12);
    }
    if (Math.abs(cutoff - this.musicCut) > 1) {
      this.musicCut = cutoff;
      this.musicLP.frequency.setTargetAtTime(cutoff, this.ac.currentTime, 0.08);
    }
  }

  /** Pause menu: sink the music underwater instead of cutting it. */
  setPauseDuck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    if (!this.ac || !this.musicLP || !this.musicBus) return;
    this.musicLP.frequency.setTargetAtTime(on ? 640 : 20000, this.ac.currentTime, 0.12);
    this.musicCut = on ? 640 : 20000;
    this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOL * 0.45 : MUSIC_VOL, this.ac.currentTime, 0.12);
  }

  /* ------------------------------ game events ----------------------------- */

  /** Boomerang leaves the hand — charged throws get the heavier whoosh. */
  throw_(charge = 0): void {
    this.play(charge >= 0.65 ? 'throwbig' : 'throw');
  }
  catch_(): void {
    this.play('catch');
  }
  slash(): void {
    this.play('slash');
  }
  dash(): void {
    this.play('dash');
  }
  jump(): void {
    this.play('jump');
  }
  land(): void {
    this.play('land');
  }
  step(): void {
    this.play('step');
  }
  slice(): void {
    this.play('slice');
  }
  shatter(): void {
    this.play('shatter');
  }
  /** The deep sub-drop under a round-deciding (slow-mo) kill. */
  bigkill(): void {
    this.play('bigkill');
  }
  /** A parry — each one deeper into a rally rings a semitone-ish higher. */
  parry(rally = 1): void {
    const step = Math.min(8, Math.max(0, rally - 1));
    this.play('parry', 1, 1 + step * 0.07);
    if (rally >= 2) this.tone('triangle', 520 * Math.pow(1.122, step), 540 * Math.pow(1.122, step), 0.16, 0.16);
  }
  /** A bare-handed swat at thin air (or, with luck, at a boomerang). */
  swat(): void {
    this.play('slash', 0.6, 1.45);
  }
  /** Steel on steel: two boomerangs (or two blades) meeting. */
  clang(vol = 1): void {
    this.play('parry', 0.8 * vol, 0.72);
    this.play('bounce', 0.9 * vol, 1.5);
  }
  /** A dash tackle landing — a dull, comic thump. */
  bonk(vol = 1): void {
    this.play('land', 1.7 * vol, 0.62);
    this.tone('sine', 190, 70, 0.14, 0.3 * vol);
  }
  /** A spring-loaded bumper firing something back out. */
  bumper(): void {
    this.tone('sine', 330, 760, 0.16, 0.2);
    this.tone('triangle', 660, 1320, 0.1, 0.09, 0.02);
    this.play('bounce', 0.9, 1.25);
  }
  /** Fire meeting ice. */
  fizz(): void {
    this.play('ignite', 0.6, 1.7);
  }
  /** The sparkle under a trick-shot callout. */
  trick(): void {
    this.tone('triangle', 880, 880, 0.09, 0.13);
    this.tone('triangle', 1175, 1175, 0.09, 0.13, 0.07);
    this.tone('triangle', 1568, 1568, 0.16, 0.13, 0.14);
  }
  /** A fighter's dying squeak — one cartoon chirp, pitched per character. */
  yelp(charIdx: number): void {
    const f = 520 + ((charIdx * 97) % 9) * 55;
    this.tone('square', f * 1.5, f * 0.55, 0.2, 0.07);
  }
  /** A ghost's gust. */
  boo(): void {
    this.tone('sine', 300, 150, 0.32, 0.2);
    this.tone('sine', 452, 226, 0.32, 0.08);
  }
  /** Bushes catching light. */
  whoosh(): void {
    this.play('ignite', 0.9, 0.8);
  }
  /** "SHOWDOWN!" — the round is down to its last two. */
  showdown(): void {
    this.play('hurry', 0.6, 1.25);
  }

  /**
   * The charge whine: a quiet tone that climbs with the wind-up, so a full
   * charge is heard rather than watched for. Pass 0 to release it.
   */
  chargeTone(k: number): void {
    if (!this.ac || !this.sfxBus) return;
    if (k <= 0 || this.muted) {
      if (this.chargeGain) this.chargeGain.gain.setTargetAtTime(0, this.ac.currentTime, 0.03);
      return;
    }
    if (!this.chargeOsc) {
      this.chargeOsc = this.ac.createOscillator();
      this.chargeOsc.type = 'triangle';
      this.chargeGain = this.ac.createGain();
      this.chargeGain.gain.value = 0;
      this.chargeOsc.connect(this.chargeGain);
      this.chargeGain.connect(this.sfxBus);
      this.chargeOsc.start();
    }
    this.chargeOsc.frequency.setTargetAtTime(210 + k * 330, this.ac.currentTime, 0.03);
    this.chargeGain!.gain.setTargetAtTime(0.03 + k * 0.035, this.ac.currentTime, 0.04);
  }
  shield(): void {
    this.play('shield');
  }
  power(): void {
    this.play('power');
  }
  golden(): void {
    this.play('golden');
  }
  freeze(): void {
    this.play('freeze');
  }
  crack(): void {
    this.play('crack');
  }
  bomb(): void {
    this.play('bomb');
  }
  ignite(): void {
    this.play('ignite');
  }
  fall(): void {
    this.play('fall');
  }
  crush(): void {
    this.play('crush');
  }
  bounce(): void {
    this.play('bounce');
  }
  portal(): void {
    this.play('portal');
  }
  warp(): void {
    this.play('warp');
  }
  pop(): void {
    this.play('pop');
  }
  switch_(): void {
    this.play('switch');
  }
  gate(): void {
    this.play('gate');
  }
  charge(): void {
    this.play('charge');
  }
  /** Kill-streak stinger — pitched up a notch per chained kill. */
  streak(n: number): void {
    this.play('streak', 1, 1 + Math.min(3, Math.max(0, n - 2)) * 0.12);
  }
  hurry(): void {
    this.play('hurry');
  }
  sudden(): void {
    this.play('sudden');
  }
  heartbeat(): void {
    this.play('heartbeat');
  }
  pip(): void {
    this.play('pip');
  }
  fight(): void {
    this.play('fight');
  }
  respawn(): void {
    this.play('respawn');
  }
  roundWin(): void {
    this.play('roundwin');
  }
  matchWin(): void {
    this.play('matchwin');
  }
  matchLose(): void {
    this.play('matchlose');
  }

  /* -------------------------------- UI ------------------------------------ */

  uiClick(): void {
    this.play('uiclick');
  }
  uiHover(): void {
    this.play('uihover');
  }
  uiBack(): void {
    this.play('uiback');
  }
  pauseOpen(): void {
    this.play('pausein');
  }
  pauseClose(): void {
    this.play('pauseout');
  }

  /* Legacy aliases (pre-sample synth API) so stray callers keep working. */
  tick(): void {
    this.uiClick();
  }
  pause(): void {
    this.pauseOpen();
  }
  win(): void {
    this.roundWin();
  }
}

export const audio = new AudioEngine();

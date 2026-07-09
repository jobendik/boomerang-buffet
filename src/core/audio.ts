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
    g.connect(this.sfxBus);
    this.voices.set(key, (this.voices.get(key) ?? 0) + 1);
    src.onended = () => {
      this.voices.set(key, Math.max(0, (this.voices.get(key) ?? 1) - 1));
      g.disconnect();
    };
    src.start();
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
    this.current = { src, gain, name: want };
  }

  /** Pause menu: sink the music underwater instead of cutting it. */
  setPauseDuck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    if (!this.ac || !this.musicLP || !this.musicBus) return;
    this.musicLP.frequency.setTargetAtTime(on ? 640 : 20000, this.ac.currentTime, 0.12);
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
  parry(): void {
    this.play('parry');
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

import type { Player } from '../entities/Player';
import type { Boomerang } from '../entities/Boomerang';
import type { Pickup } from '../entities/Pickup';
import type { Particle } from '../entities/Particle';
import type { FirePatch } from '../entities/FirePatch';
import type { IcePatch } from '../entities/IcePatch';
import type { Crusher } from '../entities/Crusher';
import type { PowerKey } from '../data/powers';
import type { Vec2 } from '../types';

/**
 * A DECOY clone — a short-lived, inert look-alike spawned when a fighter with
 * the Decoy power dashes. It mimics their character, aim and boomerang count so
 * bots are drawn to attack the phantom (see `ai.ts` targeting) while the real
 * fighter slips away.
 */
export interface Decoy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  charIdx: number;
  aim: Vec2;
  booms: number;
  team: number; // copied from the owner so bots resolve friend/foe correctly
  ownerIdx: number;
  life: number;
  ttl: number;
  bob: number;
}

/** Anything in `game.hazards`: a self-updating, self-drawing ground hazard. */
export type Hazard = FirePatch | IcePatch;

/** Live floor-switch state: which fighters stand on it and whether it's pressed. */
export interface SwitchState {
  x: number;
  y: number;
  r: number;
  gate: number;
  pressed: boolean;
  on: number[]; // idxs of fighters currently standing on it (for rising-edge credit)
}

/** Live gate state: a solid block that's open (retracted) while pressed. */
export interface GateState {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
}

/**
 * The single mutable game-state container. Kept dependency-light (type-only
 * imports) so it can be imported everywhere without creating runtime cycles.
 */

export type GamePhase = 'menu' | 'countdown' | 'playing' | 'roundover' | 'matchover';

/** Which screen the menu phase is showing. */
export type MenuPage = 'title' | 'setup' | 'help';

/** A short-lived HUD notice shown when the human grabs a power book. */
export interface Toast {
  key: PowerKey;
  t: number; // age in seconds (fades out toward TOAST_LIFE)
}

/** A fading mark left on the floor (scorches, frost rings). */
export interface Decal {
  x: number;
  y: number;
  r: number;
  t: number; // remaining life
  max: number;
  rgb: string; // 'r,g,b' triplet — alpha is animated separately
  alpha: number; // peak opacity
}

/** The Golden Boomerang objective (only present in Golden mode). */
export interface Golden {
  x: number;
  y: number;
  carrier: Player | null;
  bob: number;
}

/**
 * A live Battle Royale event — a safe circle, centred where the power was
 * grabbed, that shrinks over time. Fighters hostile to the `initiator` caught
 * outside it are purged (credited to the initiator). One at a time.
 */
export interface BattleRoyale {
  cx: number;
  cy: number;
  r: number; // current safe radius
  rStart: number;
  rMin: number;
  initiator: Player;
  t: number; // elapsed seconds
  shrink: number; // seconds taken to close from rStart to rMin
  dur: number; // total lifetime before the zone reopens
}

export interface GameState {
  state: GamePhase;
  menuPage: MenuPage; // which menu screen is showing while state === 'menu'
  paused: boolean; // Esc pause during countdown/playing
  players: Player[];
  boomerangs: Boomerang[];
  pickups: Pickup[];
  particles: Particle[];
  hazards: Hazard[];
  crushers: Crusher[];
  decoys: Decoy[]; // DECOY clones currently fooling the bots
  switches: SwitchState[]; // live floor switches for the current arena
  gates: GateState[]; // live gates, opened by their switches
  decals: Decal[]; // fading floor marks (scorches, frost)
  toasts: Toast[]; // power-pickup notices for the human player
  raining: boolean; // weather: douses fire on contact (pit-free maps only)
  time: number;
  shake: number;
  hitstop: number;
  slowmo: number; // remaining real-time seconds of cinematic slow motion
  fightT: number; // remaining life of the "FIGHT!" flash after countdown
  numPlayers: number;
  /** How many of the fighters are locally controlled humans (1-4). Each
   *  human's input device is picked independently via `controlSchemes` (e.g.
   *  two gamepads + one keyboard player), rather than being tied to a fixed
   *  P1/P2/P3/P4 order. Any remainder beyond `numHumans` are CPUs. */
  numHumans: number;
  /** Per-slot input device for each local human (index = slot in
   *  `game.players`, i.e. the first `numHumans` fighters). Values: 0 = mouse +
   *  arrow keys, 1 = WASD keys, 2 = IJKL keys, 3-6 = gamepad 1-4. Lets any
   *  combination of keyboards/gamepads be assigned to any player slot. */
  controlSchemes: number[];
  difficulty: number;
  target: number;
  arenaSel: number; // -1 = random each round, else fixed ARENAS index
  mode: number; // 0 = Free-for-all, 1 = Team Up, 2 = Golden Boomerang, 3 = Hide & Seek
  fallProtect: number; // pit accessibility: 0 = Off, 1 = Gentle, 2 = Extreme
  charSel: number; // the human's chosen fighter (-1 = random)
  golden: Golden | null;
  goldTarget: number; // seconds of carrying needed to win Golden mode
  br: BattleRoyale | null; // active Battle Royale event, if any
  hsSetup: number; // Hide & Seek: remaining seeker-blind setup time
  hsTimer: number; // Hide & Seek: remaining hunt time before the hiders win
  hsDecoys: { x: number; y: number; propIdx: number }[]; // inert lookalike props
  countdownT: number;
  roundoverT: number;
  roundWinner: Player | null;
  matchWinner: Player | null;
  pickupTimer: number;
  pickupsSpawned: number; // match-cumulative count; gates "never first" books
  roundNum: number;
}

export const game: GameState = {
  state: 'menu',
  menuPage: 'title',
  paused: false,
  players: [],
  boomerangs: [],
  pickups: [],
  particles: [],
  hazards: [],
  crushers: [],
  decoys: [],
  switches: [],
  gates: [],
  decals: [],
  toasts: [],
  raining: false,
  time: 0,
  shake: 0,
  hitstop: 0,
  slowmo: 0,
  fightT: 0,
  numPlayers: 4,
  numHumans: 1,
  controlSchemes: [0, 1, 2, 3],
  difficulty: 1,
  target: 5,
  arenaSel: -1,
  mode: 0,
  fallProtect: 1, // Gentle by default — friendlier first run, still dangerous
  charSel: -1,
  golden: null,
  goldTarget: 14,
  br: null,
  hsSetup: 0,
  hsTimer: 0,
  hsDecoys: [],
  countdownT: 0,
  roundoverT: 0,
  roundWinner: null,
  matchWinner: null,
  pickupTimer: 4,
  pickupsSpawned: 0,
  roundNum: 0,
};

/* --------------------------- control schemes ------------------------------ */

export const MAX_HUMANS = 4;
/** 0 = mouse + arrows, 1 = WASD, 2 = IJKL, 3-6 = gamepad 1-4. */
export const MAX_CONTROL_SCHEME = 6;

/** Ensure `controlSchemes` is the right length and that every active human
 *  slot (0..numHumans-1) has a distinct, in-range device — repairing any
 *  duplicates/gaps left by a stale save or a changed player count. */
export function sanitizeControlSchemes(): void {
  const cs = game.controlSchemes;
  for (let i = 0; i < MAX_HUMANS; i++) {
    const v = cs[i];
    if (!Number.isFinite(v) || v < 0 || v > MAX_CONTROL_SCHEME) cs[i] = i;
  }
  cs.length = MAX_HUMANS;
  const used = new Set<number>();
  for (let i = 0; i < game.numHumans; i++) {
    if (used.has(cs[i])) {
      let next = 0;
      while (used.has(next) && next < MAX_CONTROL_SCHEME) next++;
      cs[i] = next; // guaranteed in [0, MAX_CONTROL_SCHEME]: fewer humans than devices
    }
    used.add(cs[i]);
  }
}

/* ----------------------- settings persistence ----------------------------- */

const SAVE_KEY = 'boomerang-buffet-settings-v1';
const SAVED_FIELDS = ['numPlayers', 'numHumans', 'difficulty', 'target', 'arenaSel', 'mode', 'fallProtect', 'charSel'] as const;

/** Persist the menu selections so a returning player keeps their setup. */
export function saveSettings(): void {
  try {
    const out: Record<string, number | number[]> = {};
    for (const k of SAVED_FIELDS) out[k] = game[k];
    out.controlSchemes = game.controlSchemes;
    localStorage.setItem(SAVE_KEY, JSON.stringify(out));
  } catch {
    /* storage unavailable (private mode etc.) — settings just won't stick */
  }
}

/** Restore persisted selections (validated; bad values fall back to defaults). */
export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const k of SAVED_FIELDS) {
      const v = data[k];
      if (typeof v === 'number' && Number.isFinite(v)) game[k] = v;
    }
    if (Array.isArray(data.controlSchemes)) {
      game.controlSchemes = data.controlSchemes
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .map((v) => Math.min(MAX_CONTROL_SCHEME, Math.max(0, Math.round(v))))
        .slice(0, MAX_HUMANS);
    }
    // clamp into legal ranges in case the save predates a balance change
    game.numPlayers = Math.min(6, Math.max(2, Math.round(game.numPlayers)));
    game.numHumans = Math.min(4, game.numPlayers, Math.max(1, Math.round(game.numHumans)));
    game.difficulty = Math.min(2, Math.max(0, Math.round(game.difficulty)));
    game.target = Math.min(9, Math.max(1, Math.round(game.target)));
    game.mode = Math.min(3, Math.max(0, Math.round(game.mode)));
    game.fallProtect = Math.min(2, Math.max(0, Math.round(game.fallProtect)));
    sanitizeControlSchemes();
  } catch {
    /* corrupted save — ignore */
  }
}

loadSettings();

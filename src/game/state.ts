import type { Player } from '../entities/Player';
import type { Boomerang } from '../entities/Boomerang';
import type { Pickup } from '../entities/Pickup';
import type { Particle } from '../entities/Particle';
import type { FirePatch } from '../entities/FirePatch';
import type { IcePatch } from '../entities/IcePatch';
import type { Crusher } from '../entities/Crusher';
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

/**
 * The single mutable game-state container. Kept dependency-light (type-only
 * imports) so it can be imported everywhere without creating runtime cycles.
 */

export type GamePhase = 'menu' | 'countdown' | 'playing' | 'roundover' | 'matchover';

/** The Golden Boomerang objective (only present in Golden mode). */
export interface Golden {
  x: number;
  y: number;
  carrier: Player | null;
  bob: number;
}

export interface GameState {
  state: GamePhase;
  players: Player[];
  boomerangs: Boomerang[];
  pickups: Pickup[];
  particles: Particle[];
  hazards: Hazard[];
  crushers: Crusher[];
  decoys: Decoy[]; // DECOY clones currently fooling the bots
  raining: boolean; // weather: douses fire on contact (pit-free maps only)
  time: number;
  shake: number;
  hitstop: number;
  numPlayers: number;
  difficulty: number;
  target: number;
  arenaSel: number; // -1 = random each round, else fixed ARENAS index
  mode: number; // 0 = Free-for-all, 1 = Team Up, 2 = Golden Boomerang, 3 = Hide & Seek
  fallProtect: number; // pit accessibility: 0 = Off, 1 = Gentle, 2 = Extreme
  golden: Golden | null;
  goldTarget: number; // seconds of carrying needed to win Golden mode
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
  menuSel: number;
  flashText: string;
  flashT: number;
}

export const game: GameState = {
  state: 'menu',
  players: [],
  boomerangs: [],
  pickups: [],
  particles: [],
  hazards: [],
  crushers: [],
  decoys: [],
  raining: false,
  time: 0,
  shake: 0,
  hitstop: 0,
  numPlayers: 4,
  difficulty: 1,
  target: 5,
  arenaSel: -1,
  mode: 0,
  fallProtect: 0,
  golden: null,
  goldTarget: 14,
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
  menuSel: 0, // for hover
  flashText: '',
  flashT: 0,
};

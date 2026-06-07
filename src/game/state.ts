import type { Player } from '../entities/Player';
import type { Boomerang } from '../entities/Boomerang';
import type { Pickup } from '../entities/Pickup';
import type { Particle } from '../entities/Particle';
import type { FirePatch } from '../entities/FirePatch';

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
  hazards: FirePatch[];
  time: number;
  shake: number;
  hitstop: number;
  numPlayers: number;
  difficulty: number;
  target: number;
  arenaSel: number; // -1 = random each round, else fixed ARENAS index
  mode: number; // 0 = Free-for-all, 1 = Team Up, 2 = Golden Boomerang
  golden: Golden | null;
  goldTarget: number; // seconds of carrying needed to win Golden mode
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
  time: 0,
  shake: 0,
  hitstop: 0,
  numPlayers: 4,
  difficulty: 1,
  target: 5,
  arenaSel: -1,
  mode: 0,
  golden: null,
  goldTarget: 14,
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

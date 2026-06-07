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

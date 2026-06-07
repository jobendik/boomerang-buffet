import { audio } from '../core/audio';
import { dist, rand, randi } from '../core/math';
import { BOUNDS } from '../constants';
import { OBSTACLES, SPAWNS } from '../data/arena';
import { POWER_KEYS } from '../data/powers';
import { Player } from '../entities/Player';
import { Pickup } from '../entities/Pickup';
import { game } from './state';

/** Match / round lifecycle and power-up spawning. */

function buildPlayers(): void {
  game.players = [];
  // shuffle character indices
  const idxs = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  // shuffle spawn order
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  for (let i = 0; i < game.numPlayers; i++) {
    const p = new Player(idxs[i], spawnsOrder[i], i !== 0);
    game.players.push(p);
  }
}

export function startMatch(): void {
  buildPlayers();
  game.roundNum = 0;
  game.matchWinner = null;
  game.roundWinner = null;
  for (const p of game.players) p.score = 0;
  startRound();
}

export function startRound(): void {
  game.roundNum++;
  game.boomerangs = [];
  game.pickups = [];
  game.particles = [];
  game.hazards = [];
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  game.players.forEach((p, i) => {
    p.reset(SPAWNS[spawnsOrder[i]]);
    p.invuln = 0.8;
  });
  game.pickupTimer = 3.5;
  game.state = 'countdown';
  game.countdownT = 2.2;
}

export function endRoundCheck(): void {
  const alive = game.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    game.roundWinner = alive.length === 1 ? alive[0] : null;
    if (game.roundWinner) game.roundWinner.score++;
    game.state = 'roundover';
    game.roundoverT = 2.0;
    if (game.roundWinner) audio.win();
    // match end?
    const champ = game.players.find((p) => p.score >= game.target);
    if (champ) game.matchWinner = champ;
  }
}

/**
 * Dynamic economy: the more powers the most-buffed player holds, the less
 * likely a new power book spawns — discouraging snowballing (each held power
 * cuts the spawn chance by ~20%, per the original design).
 */
export function pickupSpawnChance(): number {
  let max = 0;
  for (const p of game.players) max = Math.max(max, p.powers.size);
  return Math.pow(0.8, max);
}

export function spawnPickup(): void {
  const type = POWER_KEYS[randi(0, POWER_KEYS.length - 1)];
  // find free location
  for (let tries = 0; tries < 30; tries++) {
    const x = rand(BOUNDS.l + 50, BOUNDS.r - 50);
    const y = rand(BOUNDS.t + 50, BOUNDS.b - 50);
    let ok = true;
    for (const R of OBSTACLES) {
      if (x > R.x - 30 && x < R.x + R.w + 30 && y > R.y - 30 && y < R.y + R.h + 30) ok = false;
    }
    for (const p of game.players) if (p.alive && dist(x, y, p.x, p.y) < 90) ok = false;
    for (const pk of game.pickups) if (dist(x, y, pk.x, pk.y) < 80) ok = false;
    if (ok) {
      game.pickups.push(new Pickup(x, y, type));
      return;
    }
  }
}

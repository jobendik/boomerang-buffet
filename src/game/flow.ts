import { audio } from '../core/audio';
import { dist, rand, randi } from '../core/math';
import { BOUNDS } from '../constants';
import { ARENAS, OBSTACLES, PITS, SPAWNS, setArena } from '../data/arena';
import { POWER_KEYS, NEVER_FIRST } from '../data/powers';
import { CHARS } from '../data/characters';
import { Player } from '../entities/Player';
import { Pickup } from '../entities/Pickup';
import { game } from './state';

/** Match / round lifecycle and power-up spawning. */

function buildPlayers(): void {
  game.players = [];
  // shuffle the full character roster + spawn order
  const idxs = CHARS.map((_, i) => i).sort(() => Math.random() - 0.5);
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  for (let i = 0; i < game.numPlayers; i++) {
    const p = new Player(idxs[i], spawnsOrder[i], i !== 0);
    // Team Up: split the lobby into two squads (you always lead team 0)
    p.team = game.mode === 1 ? i % 2 : -1;
    game.players.push(p);
  }
}

export function startMatch(): void {
  buildPlayers();
  game.roundNum = 0;
  game.matchWinner = null;
  game.roundWinner = null;
  game.pickupsSpawned = 0;
  game.golden = null;
  // Golden mode: scale the hold time up for smaller lobbies so it stays tense
  game.goldTarget = game.numPlayers <= 3 ? 18 : 14;
  for (const p of game.players) {
    p.score = 0;
    p.goldTime = 0;
  }
  startRound();
}

export function startRound(): void {
  game.roundNum++;
  // pick the arena (random each round, or the fixed selection) BEFORE spawning,
  // so spawns/pits/portals all come from the right layout
  setArena(game.arenaSel < 0 ? randi(0, ARENAS.length - 1) : game.arenaSel);
  game.boomerangs = [];
  game.pickups = [];
  game.particles = [];
  game.hazards = [];
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  game.players.forEach((p, i) => {
    p.reset(SPAWNS[spawnsOrder[i]]);
    p.invuln = 0.8;
  });
  // Golden Boomerang resets to centre each round; carried time is cumulative
  if (game.mode === 2) {
    game.golden = { x: (BOUNDS.l + BOUNDS.r) / 2, y: (BOUNDS.t + BOUNDS.b) / 2, carrier: null, bob: 0 };
  } else {
    game.golden = null;
  }
  game.pickupTimer = 3.5;
  game.state = 'countdown';
  game.countdownT = 2.2;
}

export function endRoundCheck(): void {
  const alive = game.players.filter((p) => p.alive);

  // Golden Boomerang: the match is won by holding time (handled in update), so
  // a round only ends when the field is cleared — then we simply re-rack.
  if (game.mode === 2) {
    if (alive.length <= 1 && !game.matchWinner) {
      game.roundWinner = alive[0] ?? null;
      game.state = 'roundover';
      game.roundoverT = 1.4;
    }
    return;
  }

  // Team Up: the round ends once only one squad has members left standing.
  if (game.mode === 1) {
    const teams = new Set(alive.map((p) => p.team));
    if (teams.size <= 1) {
      game.roundWinner = alive[0] ?? null;
      for (const p of alive) p.score++; // whole surviving squad scores
      game.state = 'roundover';
      game.roundoverT = 2.0;
      if (game.roundWinner) audio.win();
      const champ = game.players.find((p) => p.score >= game.target);
      if (champ) game.matchWinner = champ;
    }
    return;
  }

  // Free-for-all: last snack standing.
  if (alive.length <= 1) {
    game.roundWinner = alive.length === 1 ? alive[0] : null;
    if (game.roundWinner) game.roundWinner.score++;
    game.state = 'roundover';
    game.roundoverT = 2.0;
    if (game.roundWinner) audio.win();
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
  // some books (e.g. the BAMBOOZLE anti-power) are barred from being the very
  // first of a match, so a fresh player isn't blindsided by mystery controls
  const pool = game.pickupsSpawned === 0 ? POWER_KEYS.filter((k) => !NEVER_FIRST.includes(k)) : POWER_KEYS;
  const type = pool[randi(0, pool.length - 1)];
  // find free location
  for (let tries = 0; tries < 30; tries++) {
    const x = rand(BOUNDS.l + 50, BOUNDS.r - 50);
    const y = rand(BOUNDS.t + 50, BOUNDS.b - 50);
    let ok = true;
    for (const R of OBSTACLES) {
      if (x > R.x - 30 && x < R.x + R.w + 30 && y > R.y - 30 && y < R.y + R.h + 30) ok = false;
    }
    for (const P of PITS) {
      if (x > P.x - 30 && x < P.x + P.w + 30 && y > P.y - 30 && y < P.y + P.h + 30) ok = false;
    }
    for (const p of game.players) if (p.alive && dist(x, y, p.x, p.y) < 90) ok = false;
    for (const pk of game.pickups) if (dist(x, y, pk.x, pk.y) < 80) ok = false;
    if (ok) {
      game.pickups.push(new Pickup(x, y, type));
      game.pickupsSpawned++;
      return;
    }
  }
}

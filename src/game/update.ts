import { norm, rand } from '../core/math';
import { keys, mouse } from '../core/input';
import { aiThink } from '../systems/ai';
import { resolveBoomerangHits, resolveSlashes } from '../systems/collision';
import { game } from './state';
import { endRoundCheck, pickupSpawnChance, spawnPickup, startRound } from './flow';
import type { Intents } from '../types';
import type { Player } from '../entities/Player';

/** Per-frame simulation step and human input translation. */

function humanIntents(p: Player): Intents {
  let mx = 0;
  let my = 0;
  if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) my += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  const aim = norm(mouse.x - p.x, mouse.y - p.y);
  return {
    move: [mx, my],
    aimX: aim[0],
    aimY: aim[1],
    throwHeld: mouse.down,
    dash: keys['Space'],
    slash: mouse.rdown || keys['KeyE'],
  };
}

export function update(dt: number): void {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 40);

  if (game.state === 'menu' || game.state === 'matchover') return;

  if (game.state === 'countdown') {
    game.countdownT -= dt;
    if (game.countdownT <= 0) game.state = 'playing';
  }

  if (game.hitstop > 0) {
    game.hitstop -= dt;
    if (game.state === 'playing') return;
  }

  if (game.state === 'playing') {
    // pickups spawn (gated by the dynamic economy decay)
    game.pickupTimer -= dt;
    if (game.pickupTimer <= 0 && game.pickups.length < 3) {
      if (Math.random() < pickupSpawnChance()) {
        spawnPickup();
        game.pickupTimer = rand(5, 8.5);
      } else {
        game.pickupTimer = rand(2, 3.5); // leader heavily buffed — retry sooner, spawn less
      }
    }

    // players
    for (const p of game.players) {
      if (!p.alive) continue;
      const intents = p.isAI ? aiThink(p, dt) : humanIntents(p);
      p.update(dt, intents);
    }
    // boomerangs
    for (const b of game.boomerangs) b.update(dt);
    resolveBoomerangHits();
    resolveSlashes();
    // hazards
    game.hazards = game.hazards.filter((h) => h.update(dt));
    // pickups
    game.pickups = game.pickups.filter((pk) => pk.update(dt));
    // cleanup dead boomerangs
    game.boomerangs = game.boomerangs.filter((b) => !b.dead);

    endRoundCheck();
  }

  if (game.state === 'roundover') {
    // let particles settle
    for (const b of game.boomerangs) b.update(dt);
    game.boomerangs = game.boomerangs.filter((b) => !b.dead);
    game.hazards = game.hazards.filter((h) => h.update(dt));
    game.roundoverT -= dt;
    if (game.roundoverT <= 0) {
      if (game.matchWinner) game.state = 'matchover';
      else startRound();
    }
  }

  game.particles = game.particles.filter((p) => p.update(dt));
}

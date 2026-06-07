import { audio } from '../core/audio';
import { dist, norm, rand } from '../core/math';
import { keys, mouse } from '../core/input';
import { aiThink } from '../systems/ai';
import { resolveBoomerangHits, resolvePlayerCollisions, resolveSlashes, spreadFire } from '../systems/collision';
import { spawnRing } from '../systems/effects';
import { game } from './state';
import { endRoundCheck, pickupSpawnChance, spawnPickup, startRound } from './flow';
import type { Intents } from '../types';
import type { Player } from '../entities/Player';

/** Golden Boomerang objective: pick-up-by-touch, accumulate hold time, win. */
function updateGolden(dt: number): void {
  const g = game.golden;
  if (!g) return;
  g.bob += dt;
  const carrier = g.carrier;
  if (carrier && carrier.alive) {
    g.x = carrier.x;
    g.y = carrier.y - carrier.r - 12;
    carrier.goldTime += dt;
    if (carrier.goldTime >= game.goldTarget) {
      game.matchWinner = carrier;
      game.roundWinner = carrier;
      game.state = 'roundover';
      game.roundoverT = 2.2;
      audio.win();
    }
    return;
  }
  // unheld: the first living fighter to touch it becomes the new carrier
  g.carrier = null;
  for (const p of game.players) {
    if (p.alive && dist(p.x, p.y, g.x, g.y) < p.r + 16) {
      g.carrier = p;
      spawnRing(p.x, p.y, '#ffd23a', 1.3);
      audio.power();
      break;
    }
  }
}

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
    resolvePlayerCollisions(); // soft separation + frozen-shatter-on-bump
    spreadFire(); // burning fighters ignite their neighbours
    updateGolden(dt); // Golden Boomerang carry/score (no-op in other modes)
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

import { audio } from '../core/audio';
import { dist, rand } from '../core/math';
import { game, tally } from '../game/state';
import type { BushState } from '../game/state';
import { Particle } from '../entities/Particle';
import { spawnDecal, spawnPopText, spawnSteam } from './effects';
import type { Player } from '../entities/Player';

/**
 * Bushes are cover — and kindling. Anything burning that touches one (a fire
 * boomerang, a flame patch, a fighter who's alight, a blast) sets it ablaze:
 * for a few seconds it's a bonfire that ignites whoever is hiding inside,
 * then it's a charred stump for the rest of the round. Camping in the
 * shrubbery next to someone holding the Fire power is a decision.
 */

const BURN_TIME = 2.8;

function contains(b: BushState, x: number, y: number, m = 0): boolean {
  return x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m;
}

/** The live bush covering a point, if any (burnt stumps hide nobody). */
export function bushAt(x: number, y: number): BushState | null {
  for (const b of game.bushes) if (!b.burnt && contains(b, x, y)) return b;
  return null;
}

/** Set any bush touching (x, y) alight on `by`'s behalf. Rain keeps them damp. */
export function igniteBushAt(x: number, y: number, by: Player | null, reach = 6): void {
  if (game.raining) return;
  for (const b of game.bushes) {
    if (b.burnt || b.burnT > 0 || !contains(b, x, y, reach)) continue;
    b.burnT = BURN_TIME;
    b.by = by;
    tally('bushfire');
    audio.whoosh();
    spawnPopText(b.x + b.w / 2, b.y + 6, 'WHOOSH!', '#ff9a3a', 16);
  }
}

export function updateBushes(dt: number): void {
  for (const b of game.bushes) {
    if (b.burnt) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    // rustle: fighters moving through the leaves and throws ripping past
    // give the bush a shake — the tell that somebody's in there
    b.shake = Math.max(0, b.shake - dt * 2.6);
    for (const p of game.players) {
      if (p.alive && contains(b, p.x, p.y) && Math.hypot(p.vx, p.vy) > 70) b.shake = Math.max(b.shake, p.dashT > 0 ? 1 : 0.55);
    }
    for (const bm of game.boomerangs) if (!bm.dead && contains(b, bm.x, bm.y)) b.shake = Math.max(b.shake, 0.8);
    if (b.burnT <= 0) {
      // what lights it: fire patches, fire boomerangs, fighters who are alight
      for (const hz of game.hazards) if (hz.kind === 'fire' && hz.life > 0.3 && contains(b, hz.x, hz.y, -6)) igniteBushAt(hz.x, hz.y, hz.owner);
      for (const bm of game.boomerangs) if (!bm.dead && bm.fire && contains(b, bm.x, bm.y)) igniteBushAt(bm.x, bm.y, bm.origOwner);
      for (const p of game.players) if (p.alive && p.burning > 0 && contains(b, p.x, p.y)) igniteBushAt(p.x, p.y, p.burnSource);
      continue;
    }
    b.burnT -= dt;
    // a rain shower arriving mid-blaze puts it out (the bush survives, singed)
    if (game.raining) {
      b.burnT = 0;
      spawnSteam(cx, cy, 14);
      continue;
    }
    // flames lick up through the leaves
    for (let i = 0; i < 2; i++) {
      if (Math.random() < 0.8) {
        game.particles.push(
          new Particle(rand(b.x + 6, b.x + b.w - 6), rand(b.y + 8, b.y + b.h - 4), rand(-14, 14), rand(-90, -30), rand(0.3, 0.7), Math.random() < 0.5 ? '#ffce54' : '#ff7b3a', rand(3, 7))
        );
      }
    }
    // anyone in (or brushing) the bonfire catches light — its arsonist too
    for (const p of game.players) {
      if (p.alive && p.invuln <= 0 && contains(b, p.x, p.y, 4) && dist(p.x, p.y, cx, cy) < Math.max(b.w, b.h) * 0.62) p.ignite(b.by && b.by !== p ? b.by : null);
    }
    if (b.burnT <= 0) {
      b.burnt = true;
      spawnDecal(cx, cy, Math.max(b.w, b.h) * 0.55, 30, '16,9,14', 0.45);
      spawnSteam(cx, cy, 12);
    }
  }
}

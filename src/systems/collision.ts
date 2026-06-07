import { audio } from '../core/audio';
import { clamp, dist, dist2, norm, TAU } from '../core/math';
import { OBSTACLES } from '../data/arena';
import { SLASH_RANGE, SLASH_HALF } from '../constants';
import { game } from '../game/state';
import { spawnRing } from './effects';
import type { CircleRectHit, Rect } from '../types';
import type { Player } from '../entities/Player';
import type { Boomerang } from '../entities/Boomerang';

/** Geometry + gameplay collision resolution. */

export function circleRect(cx: number, cy: number, cr: number, R: Rect): CircleRectHit {
  const nx = clamp(cx, R.x, R.x + R.w);
  const ny = clamp(cy, R.y, R.y + R.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 < cr * cr) {
    const d = Math.sqrt(d2) || 0.0001;
    return { hit: true, nx: dx / d, ny: dy / d, pen: cr - d, px: nx, py: ny };
  }
  return { hit: false };
}

/** Push a circular body out of every arena obstacle it overlaps. */
export function resolveCircleObstacles(o: { x: number; y: number; r: number }): void {
  for (const R of OBSTACLES) {
    const r = circleRect(o.x, o.y, o.r, R);
    if (r.hit) {
      o.x += r.nx! * r.pen!;
      o.y += r.ny! * r.pen!;
    }
  }
}

export function nearestEnemy(p: Player): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of game.players) {
    if (q !== p && q.alive) {
      const d = dist2(p.x, p.y, q.x, q.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

/** Smallest absolute difference between two angles, in [0, π]. */
function angDiff(a: number, b: number): number {
  let d = Math.abs(b - a) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}

/** Turn a boomerang into a transient projectile owned by the parrier. */
export function deflect(b: Boomerang, p: Player): void {
  const target = b.origOwner && b.origOwner.alive ? b.origOwner : nearestEnemy(p);
  const dir = target ? norm(target.x - p.x, target.y - p.y) : norm(-b.vx, -b.vy);
  const sp = 640;
  b.vx = dir[0] * sp;
  b.vy = dir[1] * sp;
  if (b.isMain) b.origOwner.loseBoomerang();
  b.isMain = false;
  b.transient = true;
  b.curve = 0;
  b.life = 1.0;
  b.phase = 'out';
  b.owner = p;
  b.origOwner = p;
}

/** Boomerangs slicing players (parries are handled by `resolveSlashes`). */
export function resolveBoomerangHits(): void {
  for (const b of game.boomerangs) {
    if (b.dead) continue;
    for (const p of game.players) {
      if (!p.alive) continue;
      if (p === b.origOwner) continue; // a boomerang never slices its current owner
      if (p.invuln > 0) continue;
      if (dist(b.x, b.y, p.x, p.y) < b.hitR + p.r) {
        if (b.bomb) {
          b.explode();
          break;
        }
        if (p.frozen > 0) {
          // a frozen fighter is brittle glass: ANY contact shatters them
          const [dx, dy] = norm(b.vx, b.vy);
          p.die(b.origOwner, dx, dy);
        } else if (b.ice) {
          p.freeze();
        } else if (b.fire) {
          // fire doesn't slice — it sets the target alight (a spreading DOT)
          p.ignite(b.origOwner);
        } else {
          const [dx, dy] = norm(b.vx, b.vy);
          p.die(b.origOwner, dx, dy);
        }
      }
    }
  }
}

/**
 * Active melee slashes: a short radial hitbox in front of the fighter that
 * both kills enemies at close range and clashes/parries incoming boomerangs
 * (forcing them back toward their owner). Only armed fighters can slash.
 */
export function resolveSlashes(): void {
  for (const p of game.players) {
    if (!p.alive || p.slashT <= 0) continue;
    const a = Math.atan2(p.aim[1], p.aim[0]);
    const reach = p.r + SLASH_RANGE;

    // melee kills
    for (const q of game.players) {
      if (q === p || !q.alive || q.invuln > 0) continue;
      if (dist(p.x, p.y, q.x, q.y) < reach + q.r) {
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        if (angDiff(a, ang) < SLASH_HALF) {
          const [dx, dy] = norm(q.x - p.x, q.y - p.y);
          q.die(p, dx, dy);
        }
      }
    }

    // clash / parry incoming boomerangs
    for (const b of game.boomerangs) {
      if (b.dead || b.origOwner === p) continue;
      if (dist(p.x, p.y, b.x, b.y) < reach + b.hitR) {
        const ang = Math.atan2(b.y - p.y, b.x - p.x);
        if (angDiff(a, ang) < SLASH_HALF + 0.3) {
          if (b.bomb) {
            b.explode();
            continue;
          }
          if (b.unstoppable) continue; // UNSTOPPABLE throws can't be parried
          deflect(b, p);
          p.stats.clashes++;
          audio.parry();
          spawnRing(p.x, p.y, '#bdf0ff', 1.2);
          game.shake = Math.max(game.shake, 6);
          game.hitstop = Math.max(game.hitstop, 0.05);
        }
      }
    }
  }
}

/**
 * Soft body-vs-body resolution between fighters: gently separate overlapping
 * players (so they can't stack), and shatter any frozen fighter that gets
 * bumped — the brittle-ice rule from the source design.
 */
export function resolvePlayerCollisions(): void {
  const ps = game.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      // a frozen fighter caught in a collision is smashed apart on the spot
      if (a.frozen > 0 && b.frozen <= 0 && a.invuln <= 0) {
        a.die(b, dx / d, dy / d);
        continue;
      }
      if (b.frozen > 0 && a.frozen <= 0 && b.invuln <= 0) {
        b.die(a, -dx / d, -dy / d);
        continue;
      }
      // otherwise just push them apart evenly
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}

/**
 * Contagious fire: a burning fighter sets light to anyone they touch, and
 * burning bots clustered together cascade into each other (a quirk the AI is
 * happy to walk into).
 */
export function spreadFire(): void {
  const ps = game.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.alive || a.burning <= 0) continue;
    for (let j = 0; j < ps.length; j++) {
      if (i === j) continue;
      const b = ps[j];
      if (!b.alive || b.burning > 0 || b.invuln > 0) continue;
      if (dist2(a.x, a.y, b.x, b.y) < (a.r + b.r + 4) * (a.r + b.r + 4)) {
        b.ignite(a.burnSource ?? a);
      }
    }
  }
}

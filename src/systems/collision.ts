import { audio } from '../core/audio';
import { clamp, dist, dist2, norm, TAU } from '../core/math';
import { OBSTACLES, PITS, PORTALS, BUSHES } from '../data/arena';
import { SLASH_RANGE, SLASH_HALF } from '../constants';
import { POWERS } from '../data/powers';
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

/** Push a circular body out of every active crushing block (they're solid). */
export function resolveCrushers(o: { x: number; y: number; r: number }): void {
  for (const c of game.crushers) {
    const r = circleRect(o.x, o.y, o.r, c);
    if (r.hit) {
      o.x += r.nx! * r.pen!;
      o.y += r.ny! * r.pen!;
    }
  }
}

/** Push a circular body out of every CLOSED gate (an open gate is passable). */
export function resolveGates(o: { x: number; y: number; r: number }): void {
  for (const g of game.gates) {
    if (g.open) continue;
    const r = circleRect(o.x, o.y, o.r, g);
    if (r.hit) {
      o.x += r.nx! * r.pen!;
      o.y += r.ny! * r.pen!;
    }
  }
}

/**
 * Floor switches: recompute each plate's pressed state from who's standing on
 * it, opening the linked gate while occupied. A fighter newly stepping onto a
 * plate flips it — credited toward the "Switcheroo" award.
 */
export function updateSwitches(): void {
  if (!game.switches.length) return;
  const prevOpen = game.gates.map((g) => g.open);
  for (const g of game.gates) g.open = false;
  for (const s of game.switches) {
    const now: number[] = [];
    for (const p of game.players) {
      if (!p.alive || p.airborne) continue; // a hopping fighter doesn't weigh on the plate
      if (dist(p.x, p.y, s.x, s.y) < s.r) now.push(p.idx);
    }
    // rising edges (idx present now but not last frame) count as a flip
    for (const idx of now) {
      if (!s.on.includes(idx)) {
        const p = game.players.find((q) => q.idx === idx);
        if (p) {
          p.stats.switches++;
          audio.switch_();
          spawnRing(s.x, s.y, '#ffce54', 0.9);
        }
      }
    }
    s.on = now;
    s.pressed = now.length > 0;
    if (s.pressed && game.gates[s.gate]) game.gates[s.gate].open = true;
  }
  // a stone-on-stone rumble whenever any gate actually changes state
  if (game.gates.some((g, i) => g.open !== prevOpen[i])) audio.gate();
}

/**
 * Fall-Protection: Extreme — treat every bottomless pit as a solid wall at
 * runtime, pushing a fighter out so they can never tumble in.
 */
export function resolvePitSolids(o: { x: number; y: number; r: number }): void {
  for (const R of PITS) {
    const r = circleRect(o.x, o.y, o.r, R);
    if (r.hit) {
      o.x += r.nx! * r.pen!;
      o.y += r.ny! * r.pen!;
    }
  }
}

/**
 * Fall-Protection: Gentle — apply a repulsive nudge to a fighter drifting
 * toward a pit lip, steering them back to safe ground (danger is reduced, not
 * removed: a committed dash can still carry you over).
 */
export function nudgeFromPits(o: { x: number; y: number; vx: number; vy: number }, dt: number): void {
  const margin = 30;
  for (const P of PITS) {
    const cx = P.x + P.w / 2;
    const cy = P.y + P.h / 2;
    if (o.x > P.x - margin && o.x < P.x + P.w + margin && o.y > P.y - margin && o.y < P.y + P.h + margin) {
      const [nx, ny] = norm(o.x - cx, o.y - cy);
      o.vx += nx * 900 * dt;
      o.vy += ny * 900 * dt;
    }
  }
}

/** Is a point inside any bottomless pit? (boomerangs fly over, so only the
 *  grounded fighters consult this.) */
export function inPit(x: number, y: number): boolean {
  for (const P of PITS) {
    if (x > P.x && x < P.x + P.w && y > P.y && y < P.y + P.h) return true;
  }
  return false;
}

/** Is a point inside leafy cover? (hides a fighter from bots; feeds "Rambo".) */
export function inBush(x: number, y: number): boolean {
  for (const B of BUSHES) {
    if (x > B.x && x < B.x + B.w && y > B.y && y < B.y + B.h) return true;
  }
  return false;
}

/**
 * Linked teleporters: an entity touching one node is whisked to its twin with
 * velocity preserved, then made immune for a beat so it doesn't ping-pong.
 * Works for both players and boomerangs (any { x, y, vx, vy, portalCd }).
 */
export function resolvePortals(e: { x: number; y: number; vx: number; vy: number; portalCd: number }, dt: number): void {
  if (e.portalCd > 0) {
    e.portalCd = Math.max(0, e.portalCd - dt);
    return;
  }
  for (const P of PORTALS) {
    let ex = 0;
    let ey = 0;
    if (dist(e.x, e.y, P.ax, P.ay) < P.r) {
      ex = P.bx;
      ey = P.by;
    } else if (dist(e.x, e.y, P.bx, P.by) < P.r) {
      ex = P.ax;
      ey = P.ay;
    } else {
      continue;
    }
    const [nx, ny] = norm(e.vx, e.vy);
    spawnRing(e.x, e.y, '#8affd6', 0.9);
    e.x = ex + nx * (P.r + 6);
    e.y = ey + ny * (P.r + 6);
    e.portalCd = 0.4;
    spawnRing(e.x, e.y, '#8affd6', 0.9);
    audio.portal();
    return;
  }
}

export function nearestEnemy(p: Player): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of game.players) {
    if (q.alive && p.isEnemy(q)) {
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
  b.tk = false; // a parry severs the telekinetic control link
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
      if (!b.origOwner.isEnemy(p)) continue; // never slices its owner or teammates
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
 * DECOY clones pop the moment a foe's boomerang or slash makes contact —
 * the satisfying "gotcha… nope" beat that sells the misdirection. Hitting a
 * phantom costs the attacker their shot (the boom flies on / the swing whiffs)
 * but deals no real damage. A clone's owner and teammates pass through it.
 */
export function resolveDecoyHits(): void {
  if (!game.decoys.length) return;
  const DR = 17; // clone collision radius (matches a fighter)
  for (const d of game.decoys) {
    if (d.life <= 0) continue;
    // a boomerang from anyone hostile to the clone's owner pops it
    for (const b of game.boomerangs) {
      if (b.dead) continue;
      const o = b.origOwner;
      if (o.idx === d.ownerIdx || (o.team >= 0 && d.team >= 0 && o.team === d.team)) continue;
      if (dist(b.x, b.y, d.x, d.y) < b.hitR + DR) {
        d.life = 0;
        break;
      }
    }
    if (d.life <= 0) {
      spawnRing(d.x, d.y, POWERS.DECOY.color, 1.1);
      audio.pop();
      continue;
    }
    // an enemy melee swing connecting with the clone also bursts it
    for (const p of game.players) {
      if (!p.alive || p.slashT <= 0) continue;
      if (p.idx === d.ownerIdx || (p.team >= 0 && d.team >= 0 && p.team === d.team)) continue;
      const reach = p.r + SLASH_RANGE;
      if (dist(p.x, p.y, d.x, d.y) < reach + DR) {
        const a = Math.atan2(p.aim[1], p.aim[0]);
        if (angDiff(a, Math.atan2(d.y - p.y, d.x - p.x)) < SLASH_HALF) {
          d.life = 0;
          spawnRing(d.x, d.y, POWERS.DECOY.color, 1.1);
          audio.pop();
          break;
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
      if (!q.alive || q.invuln > 0 || !p.isEnemy(q)) continue;
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
      // a hopping fighter sails clear over grounded ones (and vice-versa)
      if (a.airborne || b.airborne) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      // a frozen fighter bumped by an ENEMY is smashed apart on the spot
      if (a.frozen > 0 && b.frozen <= 0 && a.invuln <= 0 && a.isEnemy(b)) {
        a.die(b, dx / d, dy / d);
        continue;
      }
      if (b.frozen > 0 && a.frozen <= 0 && b.invuln <= 0 && b.isEnemy(a)) {
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
      if (!b.alive || b.burning > 0 || b.invuln > 0 || !a.isEnemy(b)) continue;
      if (dist2(a.x, a.y, b.x, b.y) < (a.r + b.r + 4) * (a.r + b.r + 4)) {
        b.ignite(a.burnSource ?? a);
      }
    }
  }
}

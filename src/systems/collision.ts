import { audio } from '../core/audio';
import { clamp, dist, dist2, norm, TAU } from '../core/math';
import { OBSTACLES, PITS, PORTALS, BUSHES } from '../data/arena';
import { SLASH_RANGE, SLASH_HALF } from '../constants';
import { POWERS } from '../data/powers';
import { game } from '../game/state';
import { spawnImpact, spawnPopText, spawnRing, spawnSparks, spawnSteam } from './effects';
import { kick, tally } from '../game/state';
import { SHOVE_SPEED, SHOVE_STAGGER } from '../entities/Player';
import type { CircleRectHit, Rect } from '../types';
import type { DeathOpts, Player } from '../entities/Player';
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

/** Is a point within `m` px of any bottomless pit? */
export function nearPit(x: number, y: number, m: number): boolean {
  for (const P of PITS) {
    if (x > P.x - m && x < P.x + P.w + m && y > P.y - m && y < P.y + P.h + m) return true;
  }
  return false;
}

/**
 * Spring-loaded bumpers are solid to fighters — and anyone arriving at speed
 * (dashing, or sliding from a shove) is pinged straight back off, pinball
 * style. Returns true if the fighter was bounced.
 */
export function resolveBumpers(p: Player): boolean {
  let bounced = false;
  for (const B of game.bumpers) {
    const dx = p.x - B.x;
    const dy = p.y - B.y;
    const min = B.r + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    p.x = B.x + nx * min;
    p.y = B.y + ny * min;
    const sp = Math.hypot(p.vx, p.vy);
    const into = -(p.vx * nx + p.vy * ny);
    if (into > 150 && (p.dashT > 0 || p.stagger > 0 || sp > 300)) {
      // reflect about the bumper's surface and kick the speed back up
      const rx = p.vx + 2 * into * nx;
      const ry = p.vy + 2 * into * ny;
      p.knock(rx, ry, Math.max(430, sp * 0.95), 0.24, null);
      B.flash = 0.3;
      audio.bumper();
      spawnRing(B.x, B.y, '#ff7ad0', 0.9);
      spawnSparks(p.x - nx * p.r, p.y - ny * p.r, '#ffd9f0', 6);
      game.shake = Math.max(game.shake, 4);
      bounced = true;
    }
  }
  return bounced;
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
export function resolvePortals(e: { x: number; y: number; vx: number; vy: number; portalCd: number }, dt: number): boolean {
  if (e.portalCd > 0) {
    e.portalCd = Math.max(0, e.portalCd - dt);
    return false;
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
    return true;
  }
  return false;
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

/** Top speed a rally can wind a boomerang up to (px/s). */
const RALLY_MAX_SPEED = 1150;

/**
 * Parry: bat a boomerang away. It becomes the parrier's own short-lived
 * projectile and flies WHERE THEY AIM — with a little magnetism toward a foe
 * near that line (the thrower first), so a panicked swat still goes back to
 * sender while a deliberate one can be redirected at somebody else entirely.
 * Every parry in a row winds it up faster: a rally is a game of chicken that
 * ends when someone's reflexes give out.
 */
export function deflect(b: Boomerang, p: Player): void {
  const thrower = b.origOwner;
  let dir: [number, number] = [p.aim[0], p.aim[1]];
  let bestDot = 0.7; // ≈ ±45° of the aim
  for (const q of game.players) {
    if (!q.alive || q.disguised || !p.isEnemy(q)) continue;
    const to = norm(q.x - p.x, q.y - p.y);
    // the thrower gets a small edge, so "return to sender" is the default read
    const dot = to[0] * p.aim[0] + to[1] * p.aim[1] + (q === thrower ? 0.08 : 0);
    if (dot > bestDot) {
      bestDot = dot;
      dir = to;
    }
  }
  const sp = Math.min(RALLY_MAX_SPEED, Math.max(Math.hypot(b.vx, b.vy), 590) * 1.17);
  b.vx = dir[0] * sp;
  b.vy = dir[1] * sp;
  // hop it clear of the blade so the same swing can't catch it twice
  b.x = p.x + dir[0] * (p.r + b.r + 8);
  b.y = p.y + dir[1] * (p.r + b.r + 8);
  if (b.isMain) b.origOwner.loseBoomerang();
  b.isMain = false;
  b.transient = true;
  b.tk = false; // a parry severs the telekinetic control link
  b.curve = 0;
  b.life = 1.3;
  b.phase = 'out';
  b.prevOwner = thrower;
  b.owner = p;
  b.origOwner = p;
  b.rally++;
  b.bounces = 0;
  b.portals = 0;
  b.clashes = 0;
  b.clashWith = null;
  b.travel = 0;
  b.bounceAt = -999;
  b.grazed.clear();
  b.bounceFlash = 0.16;
  p.stats.clashes++;
  tally('parry');
  if (b.rally >= 2) tally('rally' + Math.min(4, b.rally));
  p.stats.bestRally = Math.max(p.stats.bestRally, b.rally);
  thrower.stats.bestRally = Math.max(thrower.stats.bestRally, b.rally);
  p.cheerT = Math.max(p.cheerT, 0.5);
  audio.parry(b.rally);
  spawnImpact(b.x, b.y, dir[0], dir[1], '#bdf0ff');
  spawnRing(p.x, p.y, '#bdf0ff', 1.2);
  if (b.rally >= 2) spawnPopText(p.x, p.y - p.r - 10, `RALLY x${b.rally}!`, b.rally >= 4 ? '#ff7b3a' : '#ffd23a', 15 + Math.min(10, b.rally * 2));
  else spawnPopText(p.x, p.y - p.r - 10, 'PARRY!', '#bdf0ff', 14);
  game.shake = Math.max(game.shake, 5 + Math.min(6, b.rally));
  kick(dir[0], dir[1], 5);
  game.hitstop = Math.max(game.hitstop, 0.05 + Math.min(0.05, b.rally * 0.012));
}

/** The callout (if any) a boomerang kill has earned, by how it got there. */
export function shotTag(b: Boomerang, victim: Player): DeathOpts {
  if (b.rally >= 2) return { tag: `RALLY x${b.rally} KILL!`, style: 2 + b.rally };
  if (b.rally === 1) return b.prevOwner === victim ? { tag: 'RETURN TO SENDER!', style: 3 } : { tag: 'REDIRECTED!', style: 4 };
  // a ricochet only counts as marksmanship if the throw then FLEW somewhere:
  // clipping a wall an arm's length from the target is just a hit
  const banked = b.bounces >= 1 && b.travel - b.bounceAt > 85;
  if (banked && b.portals >= 1) return { tag: 'IMPOSSIBLE SHOT!', style: 5 };
  if (banked && b.bounces >= 3) return { tag: 'PINBALL WIZARD!', style: 5 };
  if (banked && b.bounces === 2) return { tag: 'DOUBLE BANK!', style: 4 };
  if (b.portals >= 1) return { tag: 'PORTAL SHOT!', style: 3 };
  // knocked off line by another boomerang or a blast, then flew on to find
  // somebody ELSE: nobody planned that
  if (b.clashes >= 1 && b.travel - b.clashAt > 70 && b.clashWith !== victim) return { tag: 'LUCKY BOUNCE!', style: 3 };
  if (banked) return { tag: 'BANK SHOT!', style: 2 };
  if (victim.stagger > 0) return { tag: 'COMBO!', style: 2 };
  if (b.isMain && b.phase === 'return' && b.retT > 0.3) return { tag: 'BACKSTAB!', style: 2 };
  if (b.phase === 'out' && b.travel > 470) return { tag: 'LONG SHOT!', style: 2 };
  return {};
}

/** Boomerangs slicing players (parries are handled by `resolveSlashes`). */
export function resolveBoomerangHits(): void {
  for (const b of game.boomerangs) {
    if (b.dead) continue;
    for (const p of game.players) {
      if (!p.alive) continue;
      if (!b.origOwner.isEnemy(p)) continue; // never slices its owner or teammates
      if (p.invuln > 0) continue;
      const d = dist(b.x, b.y, p.x, p.y);
      if (d < b.hitR + p.r) {
        if (b.bomb) {
          b.explode();
          break;
        }
        if (p.frozen > 0) {
          // a frozen fighter is brittle glass: ANY contact shatters them
          const [dx, dy] = norm(b.vx, b.vy);
          p.die(b.origOwner, dx, dy, { cause: 'shatter', ...shotTag(b, p) });
        } else if (b.ice) {
          p.freeze();
        } else if (b.fire) {
          // fire doesn't slice — it sets the target alight (a spreading DOT)
          p.ignite(b.origOwner);
        } else {
          const [dx, dy] = norm(b.vx, b.vy);
          const tag = shotTag(b, p);
          p.die(b.origOwner, dx, dy, { cause: 'boom', ...tag });
          if (!p.alive && b.rally > 0) b.origOwner.stats.rallyKills++;
        }
      } else if (d < b.hitR + p.r + 15 && !b.grazed.has(p.idx) && !b.ice && !b.fire) {
        // a hair's breadth: the throw whistles past — worth a startled face
        // and a line in the "Teflon" ledger
        b.grazed.add(p.idx);
        tally('closecall');
        p.stats.closeCalls++;
        p.flinchT = 0.6;
      }
    }
  }
}

/**
 * Boomerangs meeting mid-air. Rival throws clang off one another and carom
 * away on new lines (a face-off's simultaneous throws meet in the middle —
 * and where they go next is anyone's guess). Bombs go off, BIG boomerangs
 * bully straight through, and fire meeting ice cancels both in a puff of steam.
 */
export function resolveBoomerangClashes(dt: number): void {
  const bs = game.boomerangs;
  for (const b of bs) if (b.clashCd > 0) b.clashCd -= dt;
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    if (a.dead || a.clashCd > 0) continue;
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j];
      if (b.dead || b.clashCd > 0 || a.dead) continue;
      if (a.origOwner === b.origOwner || !a.origOwner.isEnemy(b.origOwner)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.hitR + b.hitR;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      tally('boomclash');
      a.origOwner.stats.boomClashes++;
      b.origOwner.stats.boomClashes++;
      if (a.bomb || b.bomb) {
        // anything touching a bomb sets it off
        if (a.bomb) a.explode();
        if (b.bomb) b.explode();
        continue;
      }
      if ((a.fire && b.ice) || (a.ice && b.fire)) {
        a.fire = a.ice = b.fire = b.ice = false;
        spawnSteam(mx, my);
        spawnPopText(mx, my, 'FIZZ!', '#e8f6ff', 15);
        audio.fizz();
      }
      // exchange the velocity components along the line of centres (equal
      // masses) — unless one is BIG, which shrugs the other aside
      const va = a.vx * nx + a.vy * ny;
      const vb = b.vx * nx + b.vy * ny;
      if (va - vb <= 0) continue; // already separating
      if (a.big !== b.big) {
        const small = a.big ? b : a;
        const sgn = a.big ? 1 : -1;
        const vs = small.vx * nx + small.vy * ny;
        const vbig = a.big ? va : vb;
        small.vx += (2 * vbig - 2 * vs) * nx;
        small.vy += (2 * vbig - 2 * vs) * ny;
        small.x += nx * sgn * (min - d);
        small.y += ny * sgn * (min - d);
        small.noteClash((a.big ? a : b).origOwner);
        small.bounceFlash = 0.14;
      } else {
        a.vx += (vb - va) * nx;
        a.vy += (vb - va) * ny;
        b.vx += (va - vb) * nx;
        b.vy += (va - vb) * ny;
        const push = (min - d) / 2 + 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        a.noteClash(b.origOwner);
        b.noteClash(a.origOwner);
        a.bounceFlash = b.bounceFlash = 0.14;
      }
      a.clashCd = b.clashCd = 0.12;
      audio.clang();
      spawnSparks(mx, my, '#fff', 10);
      spawnRing(mx, my, '#fff3df', 0.7);
      game.shake = Math.max(game.shake, 5);
      game.hitstop = Math.max(game.hitstop, 0.035);
    }
  }
}

/**
 * A blast's shockwave: fighters outside the lethal radius are hurled away
 * (credited to `owner` if that sends them somewhere fatal) and nearby
 * boomerangs are swatted onto new headings.
 */
export function blastKnock(x: number, y: number, R: number, owner: Player | null): void {
  const reach = R * 2.3;
  for (const p of game.players) {
    if (!p.alive || p.invuln > 0 || p.airborne || p.frozen > 0) continue;
    const d = dist(x, y, p.x, p.y);
    if (d >= reach + p.r) continue;
    const k = 1 - clamp((d - R) / (reach - R), 0, 1); // 1 at the lethal edge → 0 at the rim
    p.knock(p.x - x, p.y - y, 230 + 330 * k, 0.25 + 0.22 * k, owner);
  }
  for (const b of game.boomerangs) {
    if (b.dead) continue;
    const d = dist(x, y, b.x, b.y);
    if (d >= reach || d < 1) continue;
    const k = 1 - d / reach;
    b.vx += ((b.x - x) / d) * 420 * k;
    b.vy += ((b.y - y) / d) * 420 * k;
    b.noteClash(null);
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

/** How long after a swing begins the blade still counts for a clash (s). */
const CLASH_WINDOW = 0.2;

/** Is `q` within `p`'s blade reach and swing arc? */
function inSlash(p: Player, q: Player): boolean {
  if (dist(p.x, p.y, q.x, q.y) >= p.r + SLASH_RANGE + q.r) return false;
  return angDiff(Math.atan2(p.aim[1], p.aim[0]), Math.atan2(q.y - p.y, q.x - p.x)) < SLASH_HALF;
}

/**
 * Active melee slashes: a short radial hitbox in front of the fighter that
 * both kills enemies at close range and clashes/parries incoming boomerangs
 * (batting them away — see `deflect`). Only armed fighters can slash.
 *
 * Two blades meeting is a CLASH, not a coin-flip: if the fighter you swing
 * at began their own swing at you within the last beat, steel rings, nobody
 * dies and both are hurled apart.
 */
export function resolveSlashes(): void {
  for (const p of game.players) {
    if (!p.alive || p.slashT <= 0) continue;

    // melee kills (a bare-handed swat can't hurt anyone)
    for (const q of game.players) {
      if (p.swat) break;
      if (!q.alive || q.invuln > 0 || !p.isEnemy(q)) continue;
      if (!inSlash(p, q)) continue;
      const [dx, dy] = norm(q.x - p.x, q.y - p.y);
      if (q.armed && !q.swat && q.slashAge < CLASH_WINDOW && q.frozen <= 0 && inSlash(q, p)) {
        p.slashT = 0;
        q.slashT = 0;
        p.knock(-dx, -dy, 400, 0.26, q);
        q.knock(dx, dy, 400, 0.26, p);
        tally('slashclash');
        p.stats.slashClashes++;
        q.stats.slashClashes++;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        audio.clang(1.25);
        spawnSparks(mx, my, '#fff', 14);
        spawnRing(mx, my, '#fff3df', 1.1);
        spawnPopText(mx, my - 8, 'CLASH!', '#fff3df', 20);
        game.shake = Math.max(game.shake, 9);
        game.hitstop = Math.max(game.hitstop, 0.07);
        break; // this swing is spent
      }
      const tag: DeathOpts = q.stagger > 0 ? { tag: 'COMBO!', style: 2 } : q.slashAge < 0.45 && q.slashT <= 0 ? { tag: 'PUNISHED!', style: 2 } : {};
      q.die(p, dx, dy, { cause: 'slash', ...tag });
    }
  }
}

/**
 * Parries: a live swing (or bare-handed swat) bats away any rival boomerang
 * inside its arc. Resolved BEFORE boomerang hits each frame, so a swing that
 * meets the throw on the very frame it would have landed still saves you —
 * ties go to the defender. Fast boomerangs get a little extra reach so a
 * rally at full tilt can't tunnel through the window between two frames.
 */
export function resolveParries(): void {
  for (const p of game.players) {
    if (!p.alive || p.slashT <= 0) continue;
    const a = Math.atan2(p.aim[1], p.aim[0]);
    const reach = p.r + SLASH_RANGE;
    const arc = p.swat ? SLASH_HALF * 0.8 : SLASH_HALF + 0.3;
    for (const b of game.boomerangs) {
      if (b.dead || b.origOwner === p || !b.origOwner.isEnemy(p)) continue;
      const slack = Math.min(26, Math.hypot(b.vx, b.vy) * 0.018);
      if (dist(p.x, p.y, b.x, b.y) < reach + b.hitR + slack) {
        const ang = Math.atan2(b.y - p.y, b.x - p.x);
        if (angDiff(a, ang) < arc) {
          if (b.unstoppable) continue; // UNSTOPPABLE throws can't be parried
          deflect(b, p);
        }
      }
    }
  }
}

/** A dash tackle connects: `s` barges `v`, who goes sliding. */
function shove(s: Player, v: Player, nx: number, ny: number): void {
  // mostly along the tackler's line of travel, a little along the contact normal
  const [tx, ty] = norm(s.vx, s.vy);
  const [dx, dy] = norm(tx * 0.7 + nx * 0.3, ty * 0.7 + ny * 0.3);
  v.knock(dx, dy, SHOVE_SPEED, SHOVE_STAGGER, s);
  // the tackler rebounds and their dash (with its i-frames) ends on contact —
  // a blade already swinging at them WILL connect, so tackling a ready
  // swordsman head-on is a gamble
  s.dashT = 0;
  s.shoveLock = true;
  s.vx = -dx * 130;
  s.vy = -dy * 130;
  s.invuln = Math.min(s.invuln, 0.04);
  s.squashT = 0.16;
  s.stats.shoves++;
  tally('shove');
  audio.bonk();
  spawnImpact((s.x + v.x) / 2, (s.y + v.y) / 2, dx, dy, '#fff3df');
  game.shake = Math.max(game.shake, 6);
  kick(dx, dy, 6);
  game.hitstop = Math.max(game.hitstop, 0.04);
}

/**
 * Body-vs-body resolution between fighters: gently separate overlapping
 * players (so they can't stack), shatter any frozen fighter that gets bumped
 * (the brittle-ice rule) — and turn a DASH into a tackle. Barging into a
 * rival sends them sliding off balance: harmless on open floor, fatal next
 * to a pit, a piston or the flames. It's the unarmed fighter's one weapon.
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
        a.die(b, dx / d, dy / d, { cause: 'shatter' });
        continue;
      }
      if (b.frozen > 0 && a.frozen <= 0 && b.invuln <= 0 && b.isEnemy(a)) {
        b.die(a, -dx / d, -dy / d, { cause: 'shatter' });
        continue;
      }
      const nx = dx / d;
      const ny = dy / d;
      // push them apart evenly
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      if (!a.isEnemy(b)) continue;
      const aTackle = a.dashT > 0 && !a.shoveLock && a.vx * nx + a.vy * ny > 120;
      const bTackle = b.dashT > 0 && !b.shoveLock && -(b.vx * nx + b.vy * ny) > 120;
      if (aTackle && bTackle) {
        // head-on: both bounce off each other, honours even
        a.knock(-nx, -ny, 380, 0.3, b);
        b.knock(nx, ny, 380, 0.3, a);
        a.shoveLock = b.shoveLock = true;
        a.invuln = Math.min(a.invuln, 0.04);
        b.invuln = Math.min(b.invuln, 0.04);
        audio.bonk();
        spawnImpact((a.x + b.x) / 2, (a.y + b.y) / 2, nx, ny, '#fff3df');
        spawnPopText((a.x + b.x) / 2, (a.y + b.y) / 2 - 10, 'BONK!', '#fff3df', 16);
        game.shake = Math.max(game.shake, 7);
        game.hitstop = Math.max(game.hitstop, 0.05);
      } else if (aTackle) shove(a, b, nx, ny);
      else if (bTackle) shove(b, a, -nx, -ny);
      else {
        // a body sent sliding by a shove passes most of it on (newton's
        // cradle) — the original shover keeps the credit down the chain
        const as = a.stagger > 0 ? a.vx * nx + a.vy * ny : 0;
        const bs = b.stagger > 0 ? -(b.vx * nx + b.vy * ny) : 0;
        if (as > 260 && as >= bs) {
          b.knock(nx, ny, as * 0.75, 0.3, a.lastHitBy && a.lastHitBy !== b ? a.lastHitBy : a);
          a.vx *= 0.3;
          a.vy *= 0.3;
          audio.bonk(0.7);
        } else if (bs > 260) {
          a.knock(-nx, -ny, bs * 0.75, 0.3, b.lastHitBy && b.lastHitBy !== a ? b.lastHitBy : b);
          b.vx *= 0.3;
          b.vy *= 0.3;
          audio.bonk(0.7);
        }
      }
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

import { clamp, dist, dist2, lerp, norm, rand } from '../core/math';
import { OBSTACLES, PITS } from '../data/arena';
import { game } from '../game/state';
import type { Intents } from '../types';
import type { Player } from '../entities/Player';

/** CPU fighter behaviour: targeting, kiting, pickup-seeking and dodging. */

function lineHitsObstacle(x1: number, y1: number, x2: number, y2: number): boolean {
  // coarse: sample
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = lerp(x1, x2, t);
    const py = lerp(y1, y2, t);
    for (const R of OBSTACLES) {
      if (px > R.x - 4 && px < R.x + R.w + 4 && py > R.y - 4 && py < R.y + R.h + 4) return true;
    }
    // closed gates block line of sight too (an open one is passable)
    for (const g of game.gates) {
      if (!g.open && px > g.x - 4 && px < g.x + g.w + 4 && py > g.y - 4 && py < g.y + g.h + 4) return true;
    }
  }
  return false;
}

export function aiThink(p: Player, dt: number): Intents {
  const a = p.ai;
  a.tThink -= dt;
  a.tThrow -= dt;
  a.tStrafe -= dt;
  // pick target = nearest alive enemy.
  // Bots are deliberately fooled by DISGUISE and lose line-of-sight on foes
  // lurking in bushes — both flaws faithfully kept from the source AI.
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of game.players) {
    if (q.alive && !q.disguised && !q.inBush && p.isEnemy(q)) {
      const d = dist2(p.x, p.y, q.x, q.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  a.target = best;
  const intents: Intents = {
    move: [0, 0],
    aimX: p.aim[0],
    aimY: p.aim[1],
    throwNow: false,
    charge: 0.6,
    dash: false,
    slash: false,
  };
  if (a.tStrafe <= 0) {
    a.strafe = Math.random() < 0.5 ? 1 : -1;
    a.tStrafe = rand(0.6, 1.4);
  }

  // seek nearby pickup if free and have boomerang
  let pick = null;
  let pd = 9e9;
  for (const pk of game.pickups) {
    const d = dist2(p.x, p.y, pk.x, pk.y);
    if (d < pd) {
      pd = d;
      pick = pk;
    }
  }

  // DECOY attraction: a nearer enemy clone hijacks the bot's attention, so it
  // aims & throws at the phantom (the misdirection the power is bought for). It
  // won't waste a melee on thin air, so close-quarters reverts to the real foe.
  let tgX = best ? best.x : 0;
  let tgY = best ? best.y : 0;
  let tgVx = best ? best.vx : 0;
  let tgVy = best ? best.vy : 0;
  let tgDist = best ? Math.sqrt(bd) : Infinity;
  let phantom = false;
  for (const dec of game.decoys) {
    if (dec.ownerIdx === p.idx) continue;
    if (p.team >= 0 && dec.team >= 0 && p.team === dec.team) continue; // ally clone
    const dd = dist(p.x, p.y, dec.x, dec.y);
    if (dd < tgDist) {
      tgDist = dd;
      tgX = dec.x;
      tgY = dec.y;
      tgVx = 0;
      tgVy = 0;
      phantom = true;
    }
  }

  let mvx = 0;
  let mvy = 0;
  if (game.mode === 3 && p.role === 'hider') {
    // Hide & Seek hider: a weaponless bot flees the seeker, then holds still
    // (which engages its prop disguise). It still dodges below to stay alive.
    if (best) {
      const d = Math.sqrt(bd);
      if (d < 240) {
        const away = norm(p.x - best.x, p.y - best.y);
        mvx = away[0];
        mvy = away[1];
      }
    }
  } else if (best || phantom) {
    const d = tgDist;
    const [tx, ty] = norm(tgX - p.x, tgY - p.y);
    // aim with lead (a decoy is stationary, so its lead terms are zero)
    const lead = 0.12;
    const ax = tgX + tgVx * lead;
    const ay = tgY + tgVy * lead;
    const aim = norm(ax - p.x, ay - p.y);
    intents.aimX = aim[0];
    intents.aimY = aim[1];

    const idealDist = 240;
    if (pick && Math.sqrt(pd) < 260 && p.powers.size < 3) {
      const [gx, gy] = norm(pick.x - p.x, pick.y - p.y);
      mvx = gx;
      mvy = gy;
    } else {
      if (d > idealDist + 40) {
        mvx += tx;
        mvy += ty;
      } else if (d < idealDist - 60) {
        mvx -= tx;
        mvy -= ty;
      }
      // strafe
      mvx += -ty * a.strafe * 0.9;
      mvy += tx * a.strafe * 0.9;
    }

    // point-blank melee slash (faster than a throw, so prefer it up close) —
    // only against a real foe; a phantom isn't worth a swing.
    if (best && !phantom && p.armed && p.slashCd <= 0 && d < p.r + best.r + 30) {
      intents.slash = true;
    }

    // throw decision
    if (p.hasBoomerang && a.tThrow <= 0 && d < 460 && !lineHitsObstacle(p.x, p.y, tgX, tgY)) {
      const facing = norm(intents.aimX, intents.aimY);
      const dot = facing[0] * tx + facing[1] * ty;
      if (dot > 0.6 || d < 200) {
        intents.throwNow = true;
        intents.charge = clamp(d / 460 + rand(-0.1, 0.2), 0.2, 1);
        a.tThrow = rand(0.55, 1.3);
      }
    }
  } else {
    // wander
    mvx = Math.cos(p.bob * 0.3);
    mvy = Math.sin(p.bob * 0.27);
  }

  // dodge incoming enemy boomerangs / hazards
  let danger = null;
  let ddist = 9e9;
  let dangerVec: [number, number] = [0, 0];
  for (const b of game.boomerangs) {
    if (b.dead || !b.origOwner.isEnemy(p)) continue;
    const d = dist(b.x, b.y, p.x, p.y);
    if (d < 150) {
      const toMe = norm(p.x - b.x, p.y - b.y);
      const bv = norm(b.vx, b.vy);
      const approaching = bv[0] * toMe[0] + bv[1] * toMe[1];
      if (approaching > 0.4 && d < ddist) {
        ddist = d;
        danger = b;
        dangerVec = toMe;
      }
    }
  }
  if (danger) {
    // slash to clash if close, armed & facing; else dash perpendicular
    const facing = norm(intents.aimX, intents.aimY);
    const toBoom = norm(danger.x - p.x, danger.y - p.y);
    if (
      ddist < 60 &&
      p.armed &&
      p.slashCd <= 0 &&
      facing[0] * toBoom[0] + facing[1] * toBoom[1] > 0.2 &&
      Math.random() < 0.5 + game.difficulty * 0.2
    ) {
      intents.slash = true;
      intents.aimX = toBoom[0];
      intents.aimY = toBoom[1];
    } else if (p.dashCd <= 0 && ddist < 110) {
      // dash perpendicular to incoming
      const perp = [-dangerVec[1], dangerVec[0]];
      const side = Math.random() < 0.5 ? 1 : -1;
      mvx = perp[0] * side;
      mvy = perp[1] * side;
      intents.dash = true;
    } else {
      mvx += dangerVec[0];
      mvy += dangerVec[1];
    }
  }

  // avoid hazards
  for (const hz of game.hazards) {
    const d = dist(hz.x, hz.y, p.x, p.y);
    if (d < 60) {
      const [ax, ay] = norm(p.x - hz.x, p.y - hz.y);
      mvx += ax * 1.5;
      mvy += ay * 1.5;
    }
  }

  // give crushing blocks a wide berth (repel from the block's centre)
  for (const c of game.crushers) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const margin = 50;
    if (p.x > c.x - margin && p.x < c.x + c.w + margin && p.y > c.y - margin && p.y < c.y + c.h + margin) {
      const [ax, ay] = norm(p.x - cx, p.y - cy);
      mvx += ax * 2.2;
      mvy += ay * 2.2;
    }
  }

  // steer away from the lip of any bottomless pit (strong, short-range repulsion)
  for (const P of PITS) {
    const cx = P.x + P.w / 2;
    const cy = P.y + P.h / 2;
    const margin = 46;
    if (p.x > P.x - margin && p.x < P.x + P.w + margin && p.y > P.y - margin && p.y < P.y + P.h + margin) {
      const [ax, ay] = norm(p.x - cx, p.y - cy);
      mvx += ax * 2.4;
      mvy += ay * 2.4;
    }
  }

  // frozen solid: mash dash to crack free (bots, unlike fire, do fight the ice).
  // NB: deliberately no fire-extinguish here — clustered bots cascade-burn,
  // exactly the exploitable flaw the source AI is known for.
  if (p.frozen > 0) intents.dash = true;

  const n = norm(mvx, mvy);
  intents.move = mvx || mvy ? n : [0, 0];
  return intents;
}

import { clamp, dist, dist2, lerp, norm, rand } from '../core/math';
import { OBSTACLES, PITS } from '../data/arena';
import { game } from '../game/state';
import type { Intents } from '../types';
import type { Player } from '../entities/Player';

/** CPU fighter behaviour: targeting, kiting, pickup-seeking and dodging. */

/**
 * Per-difficulty behaviour profile. Every human-frustrating edge the bots had
 * (frame-perfect reactions, laser aim, machine-gun throws, instant melee) is
 * governed here so "Chill" is genuinely beatable and "Spicy" earns its name.
 */
interface AITuning {
  reactTime: [number, number]; // seconds between decision refreshes (target/aim)
  aimJitter: number; // max radians of aim error, resampled each decision
  lead: number; // velocity-lead factor when aiming at a mover (0 = none)
  throwCd: [number, number]; // seconds between throw attempts
  throwRange: number; // max distance at which a throw is attempted
  chargeErr: number; // random error mixed into the throw charge
  dodgeChance: number; // odds of reacting to an incoming boomerang at all
  dodgeDelay: [number, number]; // reaction latency before the dodge move fires
  parryChance: number; // odds of attempting a slash-parry on a close throw
  meleeWindup: [number, number]; // telegraphed pause before a point-blank slash
  jumpDodge: boolean; // whether the bot may hop over throws
}

const TUNING: AITuning[] = [
  {
    // Chill — sluggish reflexes, wobbly aim, generous openings
    reactTime: [0.45, 0.7],
    aimJitter: 0.28,
    lead: 0,
    throwCd: [1.5, 2.6],
    throwRange: 400,
    chargeErr: 0.3,
    dodgeChance: 0.25,
    dodgeDelay: [0.22, 0.42],
    parryChance: 0.12,
    meleeWindup: [0.3, 0.55],
    jumpDodge: false,
  },
  {
    // Normal — competent but human-ish: readable delays, occasional whiffs
    reactTime: [0.25, 0.45],
    aimJitter: 0.13,
    lead: 0.07,
    throwCd: [0.9, 1.7],
    throwRange: 440,
    chargeErr: 0.18,
    dodgeChance: 0.5,
    dodgeDelay: [0.1, 0.24],
    parryChance: 0.3,
    meleeWindup: [0.16, 0.32],
    jumpDodge: true,
  },
  {
    // Spicy — sharp but still fallible (never frame-perfect)
    reactTime: [0.12, 0.22],
    aimJitter: 0.055,
    lead: 0.12,
    throwCd: [0.55, 1.15],
    throwRange: 480,
    chargeErr: 0.1,
    dodgeChance: 0.72,
    dodgeDelay: [0.04, 0.12],
    parryChance: 0.55,
    meleeWindup: [0.06, 0.16],
    jumpDodge: true,
  },
];

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

/** Can the bot legally see & fight this player right now? */
function validTarget(p: Player, q: Player): boolean {
  return q.alive && !q.disguised && !q.inBush && p.isEnemy(q);
}

export function aiThink(p: Player, dt: number): Intents {
  const a = p.ai;
  const tune = TUNING[clamp(game.difficulty, 0, 2)];
  a.tThink -= dt;
  a.tThrow -= dt;
  a.tStrafe -= dt;

  // Decision tick: bots only reassess the battlefield every `reactTime`
  // seconds — this is their reaction time. Between ticks they keep tracking
  // their committed target (positions update) but won't notice a newly
  // better one, and their aim error stays whatever was last sampled.
  // Bots are deliberately fooled by DISGUISE and lose line-of-sight on foes
  // lurking in bushes — both flaws faithfully kept from the source AI.
  if (a.tThink <= 0) {
    a.tThink = rand(tune.reactTime[0], tune.reactTime[1]);
    a.aimErr = rand(-tune.aimJitter, tune.aimJitter);
    let best: Player | null = null;
    let bd = Infinity;
    for (const q of game.players) {
      if (validTarget(p, q)) {
        const d = dist2(p.x, p.y, q.x, q.y);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
    // Target stickiness: commit to the current foe unless they're gone or a
    // rival is CLEARLY closer. This spreads the bots' aggro around the lobby
    // instead of the whole field frame-perfectly converging on one player.
    const cur = a.target;
    if (!cur || !validTarget(p, cur)) a.target = best;
    else if (best && best !== cur && bd < dist2(p.x, p.y, cur.x, cur.y) * 0.5) a.target = best;
  } else if (a.target && !validTarget(p, a.target)) {
    a.target = null; // dead/hidden foes vanish immediately (no aiming at ghosts)
  }

  const best = a.target;
  const bd = best ? dist2(p.x, p.y, best.x, best.y) : Infinity;
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
    // aim with difficulty-scaled lead, then rotate by the sampled aim error —
    // bots track their foe continuously but never with laser precision
    // (a decoy is stationary, so its lead terms are zero)
    const ax = tgX + tgVx * tune.lead;
    const ay = tgY + tgVy * tune.lead;
    const trueAim = norm(ax - p.x, ay - p.y);
    const ce = Math.cos(a.aimErr);
    const se = Math.sin(a.aimErr);
    intents.aimX = trueAim[0] * ce - trueAim[1] * se;
    intents.aimY = trueAim[0] * se + trueAim[1] * ce;

    const idealDist = a.range;
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
    // only against a real foe; a phantom isn't worth a swing. The swing is
    // TELEGRAPHED: entering range arms a windup pause before the blade comes
    // out, so an alert human can dash clear (no more frame-perfect stabs).
    if (best && !phantom && p.armed && p.slashCd <= 0 && d < p.r + best.r + 30) {
      if (a.meleeT < 0) a.meleeT = rand(tune.meleeWindup[0], tune.meleeWindup[1]);
      else {
        a.meleeT -= dt;
        if (a.meleeT <= 0) {
          intents.slash = true;
          a.meleeT = -1;
        }
      }
    } else {
      a.meleeT = -1; // foe slipped out of range — the windup is wasted
    }

    // throw decision
    if (p.hasBoomerang && a.tThrow <= 0 && d < tune.throwRange && !lineHitsObstacle(p.x, p.y, tgX, tgY)) {
      const facing = norm(intents.aimX, intents.aimY);
      const dot = facing[0] * tx + facing[1] * ty;
      if (dot > 0.6 || d < 200) {
        intents.throwNow = true;
        intents.charge = clamp(d / tune.throwRange + rand(-tune.chargeErr, tune.chargeErr), 0.2, 1);
        a.tThrow = rand(tune.throwCd[0], tune.throwCd[1]);
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
    // Decide ONCE per incoming throw whether we react to it at all. Without this
    // reaction-miss roll, bots dash/jump-dodge every single boomerang — and since
    // a dodge grants invulnerability i-frames, they become untouchable and combat
    // never resolves. Even a committed dodge fires only after a human-like
    // reaction delay, so a point-blank surprise throw still connects.
    if (danger !== a.dodgeBoom) {
      a.dodgeBoom = danger;
      a.dodgeActive = Math.random() < tune.dodgeChance;
      a.dodgeDelayT = rand(tune.dodgeDelay[0], tune.dodgeDelay[1]);
      a.parryRoll = Math.random() < tune.parryChance;
    }
    if (a.dodgeActive) {
      a.dodgeDelayT -= dt;
      if (a.dodgeDelayT > 0) {
        // saw it — flinching away while the reaction winds up
        mvx += dangerVec[0] * 0.6;
        mvy += dangerVec[1] * 0.6;
      } else {
        // slash to clash if close, armed & facing; else dash perpendicular
        const facing = norm(intents.aimX, intents.aimY);
        const toBoom = norm(danger.x - p.x, danger.y - p.y);
        if (ddist < 60 && p.armed && p.slashCd <= 0 && facing[0] * toBoom[0] + facing[1] * toBoom[1] > 0.2 && a.parryRoll) {
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
        } else if (tune.jumpDodge && p.airCd <= 0 && p.airT <= 0 && ddist < 90) {
          intents.jump = true; // dash on cooldown — hop the throw instead
        } else {
          mvx += dangerVec[0];
          mvy += dangerVec[1];
        }
      }
    }
  } else {
    a.dodgeBoom = null;
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

  // Battle Royale: a hostile fighter near/outside the closing ring sprints for
  // the safe centre (the initiator & allies are immune, so they need not flee)
  if (game.br && game.br.initiator.isEnemy(p)) {
    const d = dist(p.x, p.y, game.br.cx, game.br.cy);
    if (d > game.br.r - 90) {
      const [ix, iy] = norm(game.br.cx - p.x, game.br.cy - p.y);
      mvx += ix * 2.8;
      mvy += iy * 2.8;
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

import { clamp, dist, dist2, lerp, norm, rand } from '../core/math';
import { BOUNDS } from '../constants';
import { OBSTACLES, PITS } from '../data/arena';
import { PERSONAS } from '../data/characters';
import { game } from '../game/state';
import { circleRect, inPit, nearPit, pitNormal } from './collision';
import { throwParams } from '../entities/Player';
import type { Intents, Rect } from '../types';
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
  cqHesitate: number; // odds a close-quarters (<150px) throw is fumbled/delayed
  jumpDodge: boolean; // whether the bot may hop over throws
  craft: number; // odds a throw is PLANNED (curve-compensated / banked) rather than flung
  shove: number; // appetite for dash tackles when one looks good
  recover: [number, number, number]; // knocked back: odds of reacting, then latency min/max
  temper: number; // 0..1 — how fully a bot's temperament overrides the default spacing
}

export const TUNING: AITuning[] = [
  {
    // Chill — sluggish reflexes, wobbly aim, generous openings
    reactTime: [0.6, 0.9],
    aimJitter: 0.38,
    lead: 0,
    throwCd: [2.1, 3.2],
    throwRange: 400,
    chargeErr: 0.3,
    dodgeChance: 0.25,
    dodgeDelay: [0.22, 0.42],
    parryChance: 0.08,
    meleeWindup: [0.45, 0.7],
    cqHesitate: 0.7,
    jumpDodge: false,
    craft: 0.05,
    shove: 0.2,
    recover: [0.3, 0.2, 0.32],
    temper: 0.3,
  },
  {
    // Normal — competent but human-ish: readable delays, occasional whiffs
    reactTime: [0.32, 0.55],
    aimJitter: 0.2,
    lead: 0.05,
    throwCd: [1.15, 2.0],
    throwRange: 440,
    chargeErr: 0.16,
    dodgeChance: 0.5,
    dodgeDelay: [0.1, 0.24],
    parryChance: 0.24,
    meleeWindup: [0.28, 0.46],
    cqHesitate: 0.55,
    jumpDodge: true,
    craft: 0.2,
    shove: 0.35,
    recover: [0.6, 0.1, 0.2],
    temper: 0.7,
  },
  {
    // Spicy — sharp but still fallible (never frame-perfect)
    reactTime: [0.12, 0.22],
    aimJitter: 0.07,
    lead: 0.1,
    throwCd: [0.65, 1.25],
    throwRange: 480,
    chargeErr: 0.1,
    dodgeChance: 0.72,
    dodgeDelay: [0.04, 0.12],
    parryChance: 0.48,
    meleeWindup: [0.24, 0.38],
    cqHesitate: 0.5,
    jumpDodge: true,
    craft: 0.55,
    shove: 0.7,
    recover: [0.9, 0.05, 0.12],
    temper: 1,
  },
];

/* ------------------------------ shot planning ----------------------------- */

interface ShotPlan {
  ang: number;
  charge: number;
  bounces: number;
}

/**
 * Fly one candidate throw through the real flight maths (the same numbers a
 * human's charge preview draws) and report how close it passes to where the
 * target is heading. Bounces off the arena walls and solid blocks are
 * followed, so a "miss" off a wall can score as a hit — that's a bank shot.
 */
function flyCandidate(p: Player, ang: number, charge: number, side: number, tx: number, ty: number, tvx: number, tvy: number, solids: Rect[]): { miss: number; bounces: number; t: number } {
  const tp = throwParams(charge, p.powers.has('BIG'));
  const curve = tp.curve * side;
  const step = 1 / 36;
  const R = 11;
  let vx = Math.cos(ang) * tp.speed;
  let vy = Math.sin(ang) * tp.speed;
  let x = p.x + Math.cos(ang) * (p.r + 6);
  let y = p.y + Math.sin(ang) * (p.r + 6);
  let best = Infinity;
  let bestT = 0;
  let bestB = 0;
  let bounces = 0;
  const c = Math.cos(curve * step);
  const s = Math.sin(curve * step);
  for (let t = 0; t < tp.outT; t += step) {
    const nvx = vx * c - vy * s;
    vy = vx * s + vy * c;
    vx = nvx;
    x += vx * step;
    y += vy * step;
    if (x < BOUNDS.l + R) {
      x = BOUNDS.l + R;
      vx = Math.abs(vx);
      bounces++;
    } else if (x > BOUNDS.r - R) {
      x = BOUNDS.r - R;
      vx = -Math.abs(vx);
      bounces++;
    }
    if (y < BOUNDS.t + R) {
      y = BOUNDS.t + R;
      vy = Math.abs(vy);
      bounces++;
    } else if (y > BOUNDS.b - R) {
      y = BOUNDS.b - R;
      vy = -Math.abs(vy);
      bounces++;
    }
    for (const Rc of solids) {
      const h = circleRect(x, y, R, Rc);
      if (h.hit) {
        x += h.nx! * h.pen!;
        y += h.ny! * h.pen!;
        const dot = vx * h.nx! + vy * h.ny!;
        vx -= 2 * dot * h.nx!;
        vy -= 2 * dot * h.ny!;
        bounces++;
      }
    }
    // the mark keeps (half) walking the way they were going
    const d = Math.hypot(x - (tx + tvx * t * 0.5), y - (ty + tvy * t * 0.5));
    if (d < best) {
      best = d;
      bestT = t;
      bestB = bounces;
    }
  }
  return { miss: best, bounces: bestB, t: bestT };
}

/**
 * Plan a throw the way a practised player would: picture a spread of angles
 * and charges, keep the one that actually arrives. This is what lets a bot
 * bend one round a pillar or bank it off the back wall — and it's honest: it
 * uses only what a human's own aiming preview shows, then the tier's aim
 * error is smeared on top. `flair` > 0 makes ricochets attractive.
 */
function planThrow(p: Player, tx: number, ty: number, tvx: number, tvy: number, flair: number): ShotPlan | null {
  if (p.powers.has('TELEKINESIS')) return null; // piloted throws need no plan
  const solids = game.gates.length ? [...OBSTACLES, ...game.gates.filter((g) => !g.open)] : OBSTACLES;
  const base = Math.atan2(ty - p.y, tx - p.x);
  let best: ShotPlan | null = null;
  let bestScore = Infinity;
  for (const charge of [0.2, 0.45, 0.7, 1]) {
    for (let k = -8; k <= 8; k++) {
      const ang = base + k * 0.125;
      // which way it will bank depends on how we're moving as we let go
      const cross = Math.cos(ang) * p.vy - Math.sin(ang) * p.vx;
      const side = Math.hypot(p.vx, p.vy) > 40 && Math.abs(cross) > 30 ? Math.sign(cross) : 1;
      const r = flyCandidate(p, ang, charge, side, tx, ty, tvx, tvy, solids);
      if (r.miss > 20) continue;
      // nearer & sooner is better; ricochets cost a little — unless we love them
      const score = r.miss + r.t * 14 + r.bounces * (7 - flair * 12);
      if (score < bestScore) {
        bestScore = score;
        best = { ang, charge, bounces: r.bounces };
      }
    }
  }
  return best;
}

/** Would shoving `q` along (dx, dy) send them somewhere they won't walk back from? */
function shoveIsDeadly(q: Player, dx: number, dy: number): boolean {
  for (const reach of [70, 125]) {
    const x = q.x + dx * reach;
    const y = q.y + dy * reach;
    if (inPit(x, y)) return game.fallProtect !== 2;
    for (const c of game.crushers) if (x > c.x - 10 && x < c.x + c.w + 10 && y > c.y - 10 && y < c.y + c.h + 10) return true;
    for (const hz of game.hazards) if (dist(hz.x, hz.y, x, y) < 26) return true;
    if (game.sudden) {
      const e = game.suddenEnc;
      if (x < BOUNDS.l + e || x > BOUNDS.r - e || y < BOUNDS.t + e || y > BOUNDS.b - e) return true;
    }
  }
  return false;
}

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
    for (const B of game.bumpers) if (dist2(px, py, B.x, B.y) < (B.r + 6) * (B.r + 6)) return true;
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
  const persona = PERSONAS[p.char.persona];
  a.tThink -= dt;
  a.shoveT -= dt;
  a.tackleT -= dt;
  a.tThrow -= dt;
  a.tStrafe -= dt;

  // Aggression escalation. Bots respect their comfy spacing while a human is
  // in the fight, but once the last human falls (or a round drags on) they
  // stop dancing: spacing collapses, throws come faster, dodges get sloppier.
  // This is what keeps the "two bots circling forever" spectacle short.
  const humansAlive = game.players.some((q) => q.alive && !q.isAI);
  const stallK = clamp((game.roundT - 24) / 12, 0, 1); // 0 → 1 across 24–36 s
  const agg = Math.max(humansAlive ? 0 : 0.8, stallK);

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

    // Temperament sets the spacing — but only as far as the tier allows: the
    // easier the bots, the more everyone drifts back to a polite middle
    // distance (measured: close-in brawlers were the one thing that made
    // Chill noticeably deadlier, so Chill keeps its manners).
    const spacing = lerp(245, a.range, tune.temper);
    let idealDist = spacing * (1 - 0.6 * agg); // bloodlust closes the gap
    // a foe caught empty-handed is an invitation: the hot-headed walk right
    // in for the slice instead of trading throws from range
    if (best && !phantom && p.armed && !best.armed && persona.rush > 0) idealDist = lerp(idealDist, 46, persona.rush * 0.85);
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
    // The arming range is wider than the blade's reach on purpose: a bot with
    // an aggressor in its face COMMITS to the duel — plants, winds up, swings
    // (whiffing if you slipped back out) — instead of backpedal-kiting at
    // full speed while its friends snipe the chaser. That kite-and-snipe was
    // the other half of why walking in for a slice felt hopeless.
    // Bots-only endgames shorten the windup — no human is being tested then.
    if (best && !phantom && p.armed && p.slashCd <= 0 && d < p.r + best.r + 46) {
      if (a.meleeT < 0) a.meleeT = rand(tune.meleeWindup[0], tune.meleeWindup[1]) * (humansAlive ? 1 : 1 - 0.4 * agg);
      else {
        a.meleeT -= dt;
        if (a.meleeT <= 0) {
          intents.slash = true;
          a.meleeT = -1;
        }
      }
      // planting the feet makes the windup an honest, readable stance: the
      // cocked-boomerang telegraph plus a full stop says "get out of range"
      if (a.meleeT > 0) {
        mvx = 0;
        mvy = 0;
      }
    } else {
      a.meleeT = -1; // foe slipped out of range — the windup is wasted
    }

    // DASH TACKLE. Barging a rival sends them sliding — so the moment to do
    // it is when that slide ends somewhere nasty (a pit, a piston, the
    // flames), or to spoil a wind-up, or simply because nobody here is
    // holding a boomerang and a shoving match is all that's left.
    if (best && !phantom && p.dashCd <= 0 && a.shoveT <= 0 && d > 44 && d < 126 && !best.airborne && best.frozen <= 0 && p.stagger <= 0) {
      a.shoveT = 0.3;
      let want = 0;
      if (shoveIsDeadly(best, tx, ty)) want = 1.3;
      else if (best.isGoldCarrier) want = 0.9; // knock the Golden Boomerang loose
      else if (!p.armed && best.charging) want = 0.5;
      else if (!p.armed && !best.armed) want = 0.22;
      else if (!p.armed) want = 0.06;
      // never barge off a ledge ourselves if the mark steps aside
      const ownLanding = inPit(p.x + tx * 96, p.y + ty * 96) && game.fallProtect !== 2;
      if (p.powers.has('HEAVY')) want = Math.max(want, 0.35) * 1.5; // built for it
      if (!ownLanding && !lineHitsObstacle(p.x, p.y, best.x, best.y) && Math.random() < want * tune.shove * persona.shove) {
        a.tackleT = 0.2;
        intents.dash = true;
      }
    }

    // throw decision. Close quarters are governed separately: the old blind
    // point-blank release (no facing check inside 200px) was a ~0.2s
    // unreactable dart — the single biggest reason walking up for a slice
    // felt like suicide. Now a close throw needs real facing, gets fumbled a
    // difficulty-scaled share of the time, and costs a longer reset after.
    // A share of throws (by tier and temperament) are PLANNED: the bot
    // pictures the flight — curve, walls and all — and lets fly the one that
    // arrives. That's the sharpshooter bending it round a pillar, or the
    // trickster banking one off the back wall at a foe with no line of sight.
    let planned = false;
    if (p.hasBoomerang && a.tThrow <= 0 && d > 150 && d < tune.throwRange + 60 && Math.random() < tune.craft * persona.craft) {
      const plan = planThrow(p, tgX, tgY, tgVx, tgVy, p.char.persona === 'trickster' ? 1 : p.char.persona === 'sniper' ? 0.4 : 0);
      if (plan) {
        const ang = plan.ang + a.aimErr * 0.6;
        intents.aimX = Math.cos(ang);
        intents.aimY = Math.sin(ang);
        intents.throwNow = true;
        intents.charge = clamp(plan.charge + rand(-tune.chargeErr, tune.chargeErr) * 0.3, 0.15, 1);
        a.tThrow = rand(tune.throwCd[0], tune.throwCd[1]) * (1 - 0.5 * agg);
        planned = true;
      } else {
        a.tThrow = 0.3; // nothing on — look again in a moment
      }
    }
    if (!planned && p.hasBoomerang && a.tThrow <= 0 && d < tune.throwRange && !lineHitsObstacle(p.x, p.y, tgX, tgY)) {
      const facing = norm(intents.aimX, intents.aimY);
      const dot = facing[0] * tx + facing[1] * ty;
      const close = d < 150;
      if (dot > (d < 200 ? 0.35 : 0.6)) {
        if (close && Math.random() < tune.cqHesitate * (1 - agg)) {
          a.tThrow = 0.35; // fumbled under pressure — try again shortly
        } else {
          intents.throwNow = true;
          intents.charge = clamp(d / tune.throwRange + rand(-tune.chargeErr, tune.chargeErr), 0.2, 1);
          a.tThrow = rand(tune.throwCd[0], tune.throwCd[1]) * (close ? 1.4 : 1) * (1 - 0.5 * agg);
        }
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
    // Decide ONCE per incoming throw how we'll answer it: stand and PARRY it
    // back, dodge it, or simply not notice in time. Without the miss roll,
    // bots dash/jump-dodge every single boomerang — and since a dodge grants
    // invulnerability i-frames, they become untouchable and combat never
    // resolves. Even a committed answer fires only after a human-like
    // reaction delay, so a point-blank surprise throw still connects — and a
    // rally that has wound the boomerang up fast enough outruns it entirely.
    if (danger !== a.dodgeBoom) {
      a.dodgeBoom = danger;
      // armed it's the blade; unarmed a bare-handed swat (harder, so rarer)
      const parryP = danger.unstoppable || p.isHider ? 0 : tune.parryChance * persona.parry * (p.armed ? 1 : 0.6);
      a.parryRoll = p.slashCd <= 0.2 && Math.random() < parryP;
      a.dodgeActive = a.parryRoll || Math.random() < tune.dodgeChance * persona.nerve * (1 - 0.45 * agg); // bloodlust trades defence for offence
      a.dodgeDelayT = rand(tune.dodgeDelay[0], tune.dodgeDelay[1]);
    }
    if (a.dodgeActive) {
      a.dodgeDelayT -= dt;
      const toBoom = norm(danger.x - p.x, danger.y - p.y);
      if (a.parryRoll && p.slashCd <= 0 && p.slashT <= 0) {
        // plant, square up to it, and swing as it arrives
        mvx *= 0.25;
        mvy *= 0.25;
        if (a.dodgeDelayT <= 0) {
          intents.aimX = toBoom[0];
          intents.aimY = toBoom[1];
          const sp = Math.hypot(danger.vx, danger.vy);
          if (ddist < 44 + sp * 0.075) {
            intents.slash = true;
            a.parryRoll = false; // one swing per throw
          }
        }
      } else if (a.dodgeDelayT > 0) {
        // saw it — flinching away while the reaction winds up
        mvx += dangerVec[0] * 0.6;
        mvy += dangerVec[1] * 0.6;
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
    const margin = 46;
    if (p.x > P.x - margin && p.x < P.x + P.w + margin && p.y > P.y - margin && p.y < P.y + P.h + margin) {
      const [ax, ay] = pitNormal(P, p.x, p.y);
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

  // committed to a tackle: run straight at the mark, whatever else beckons
  if (a.tackleT > 0 && best) {
    const [tx, ty] = norm(best.x - p.x, best.y - p.y);
    mvx = tx;
    mvy = ty;
  }

  // KNOCKED BACK. Decide once per shove whether we keep our wits; if so,
  // after a beat of reaction time, look where the slide is taking us — and
  // if that's somewhere fatal, dash back against it (or hop the gap).
  if (p.stagger > 0) {
    if (a.recState === 0) {
      a.recState = Math.random() < tune.recover[0] ? 1 : -1;
      a.recT = rand(tune.recover[1], tune.recover[2]);
    }
    if (a.recState === 1) {
      a.recT -= dt;
      if (a.recT <= 0) {
        const fx = p.x + p.vx * 0.28;
        const fy = p.y + p.vy * 0.28;
        let doom = game.fallProtect !== 2 && (inPit(fx, fy) || nearPit(p.x + p.vx * 0.14, p.y + p.vy * 0.14, 0));
        for (const hz of game.hazards) if (dist(hz.x, hz.y, fx, fy) < 24) doom = true;
        for (const c of game.crushers) if (fx > c.x - 8 && fx < c.x + c.w + 8 && fy > c.y - 8 && fy < c.y + c.h + 8) doom = true;
        if (doom) {
          const [bx, by] = norm(-p.vx, -p.vy);
          if (p.dashCd <= 0) {
            mvx = bx;
            mvy = by;
            intents.dash = true;
            a.tackleT = 0;
          } else if (p.airCd <= 0) intents.jump = true;
          a.recState = -1; // spent
        }
      }
    }
  } else {
    a.recState = 0;
  }

  const n = norm(mvx, mvy);
  intents.move = mvx || mvy ? n : [0, 0];
  return intents;
}

/**
 * A bot's afterlife: drift toward the nearest living rival and, when one is
 * within reach, let out a gust — eagerly if the shove would be fatal, now
 * and then just for mischief. Easier tiers haunt half-heartedly.
 */
export function ghostThink(p: Player): Intents {
  const intents: Intents = { move: [0, 0], aimX: p.aim[0], aimY: p.aim[1] };
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of game.players) {
    if (!q.alive || !p.isEnemy(q)) continue;
    const d = dist(p.gx, p.gy, q.x, q.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (!best) return intents;
  const [tx, ty] = norm(best.x - p.gx, best.y - p.gy);
  if (bd > 48) intents.move = [tx, ty];
  if (p.booCd <= 0 && bd < 70 && !best.airborne) {
    const eager = [0.25, 0.5, 0.85][clamp(game.difficulty, 0, 2)];
    const deadly = shoveIsDeadly(best, tx, ty);
    // rolled once per opportunity: on a "no", wait a beat before reconsidering
    if (Math.random() < (deadly ? eager : eager * 0.12)) intents.dash = true;
    else p.booCd = 0.5;
  }
  return intents;
}

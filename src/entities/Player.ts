import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { clamp, dist, lerp, norm, rand, TAU } from '../core/math';
import { BOUNDS, SLASH_RANGE, SLASH_HALF } from '../constants';
import { CHARS } from '../data/characters';
import { SPAWNS } from '../data/arena';
import { POWERS, ELEMENTAL_EXCLUSIVE, type PowerKey } from '../data/powers';
import { drawBoomShape, roundRectPath } from '../gfx/shapes';
import { resolveCircleObstacles } from '../systems/collision';
import { spawnDashPuff, spawnRing, spawnSlice } from '../systems/effects';
import { game } from '../game/state';
import { Boomerang } from './Boomerang';
import type { Char, Intents, Spawn, Vec2 } from '../types';

/* ----------------------------- tuning constants -------------------------- */
const SLASH_ACTIVE = 0.12; // seconds the blade is "live"
const SLASH_CD = 0.42; // base melee cooldown
const SLASH_CD_FAST = 0.24; // with EXTRA (dual-wield)
const MAX_CURVE = 5.2; // rad/s angular velocity at full charge
const RESPAWN_TIME = 1.2; // delay before a lost boomerang returns to hand

interface AIState {
  tThink: number;
  target: Player | null;
  strafe: number;
  tStrafe: number;
  tThrow: number;
  goPower: PowerKey | null;
}

interface PlayerStats {
  dashes: number;
  clashes: number;
  deaths: number;
  kills: number;
  unarmedTime: number;
}

/** A fighter — either the human (idx 0) or a CPU-controlled snack. */
export class Player {
  char: Char;
  charIdx: number;
  idx: number;
  isAI: boolean;
  r: number;
  score: number;
  aim: Vec2;
  ai: AIState;
  /** Match-cumulative telemetry (survives round resets, drives end awards). */
  stats: PlayerStats;

  // stackable modifiers, persist until death
  powers: Set<PowerKey>;

  // boomerang inventory
  boomsInHand!: number;
  boomsMax!: number;
  respawns!: number[];

  // runtime state (assigned via reset())
  x!: number;
  y!: number;
  vx!: number;
  vy!: number;
  alive!: boolean;
  charge!: number;
  charging!: boolean;
  dashT!: number;
  dashCd!: number;
  invuln!: number;
  slashT!: number;
  slashCd!: number;
  frozen!: number;
  spawnFlash!: number;
  bob!: number;
  shieldFlash!: number;

  constructor(charIdx: number, idx: number, isAI: boolean) {
    this.char = CHARS[charIdx];
    this.charIdx = charIdx;
    this.idx = idx;
    this.isAI = isAI;
    this.r = 17;
    this.powers = new Set();
    this.stats = { dashes: 0, clashes: 0, deaths: 0, kills: 0, unarmedTime: 0 };
    this.reset(SPAWNS[idx % SPAWNS.length]);
    this.score = 0;
    this.aim = [1, 0];
    this.ai = {
      tThink: 0,
      target: null,
      strafe: rand(-1, 1) > 0 ? 1 : -1,
      tStrafe: 0,
      tThrow: rand(0.3, 1.2),
      goPower: null,
    };
  }

  reset(sp: Spawn): void {
    this.x = sp.x;
    this.y = sp.y;
    this.vx = 0;
    this.vy = 0;
    this.alive = true;
    this.boomsInHand = 1;
    this.boomsMax = 1;
    this.respawns = [];
    this.charge = 0;
    this.charging = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.slashT = 0;
    this.slashCd = 0;
    this.frozen = 0;
    this.spawnFlash = 0.6;
    this.bob = rand(0, TAU);
    this.shieldFlash = 0;
    this.powers.clear(); // modifiers are lost on death / new round
  }

  get hasBoomerang(): boolean {
    return this.boomsInHand > 0;
  }
  /** Armed = holding at least one boomerang (can throw & slash). */
  get armed(): boolean {
    return this.boomsInHand > 0;
  }

  /** Apply a collected power-up, honouring stacking & elemental exclusion. */
  applyPower(type: PowerKey): void {
    // Fire / Ice are mutually exclusive — taking one drops the other.
    if (ELEMENTAL_EXCLUSIVE.includes(type)) {
      for (const e of ELEMENTAL_EXCLUSIVE) if (e !== type) this.powers.delete(e);
    }
    this.powers.add(type);
    if (type === 'EXTRA') {
      this.boomsMax = 2;
      this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    }
  }

  /* intents are set by human input or AI before update */
  update(dt: number, intents: Intents): void {
    if (!this.alive) return;
    this.bob += dt * 8;

    // timers
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.slashCd = Math.max(0, this.slashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.spawnFlash = Math.max(0, this.spawnFlash - dt);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);
    if (this.slashT > 0) this.slashT = Math.max(0, this.slashT - dt);
    if (this.dashT > 0) this.dashT = Math.max(0, this.dashT - dt);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);

    // boomerang respawns (lost boomerangs return to hand after a delay)
    if (this.respawns.length) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        this.respawns[i] -= dt;
        if (this.respawns[i] <= 0) {
          this.respawns.splice(i, 1);
          this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
        }
      }
    }

    // unarmed-time telemetry (the vulnerable, weaponless window)
    if (!this.armed) this.stats.unarmedTime += dt;

    const frozen = this.frozen > 0;
    const caffeinated = this.powers.has('SPEED');

    // aim
    if (!frozen) this.aim = norm(intents.aimX, intents.aimY);

    // movement
    let speedMul = 1;
    if (caffeinated) speedMul = 1.45;
    if (this.charging) speedMul *= 0.55;
    const baseSpeed = 235 * speedMul;
    if (frozen) intents.move = [0, 0];

    if (this.dashT > 0) {
      // dash overrides
    } else {
      const [mx, my] = intents.move;
      const target = norm(mx, my);
      const goal = mx || my ? [target[0] * baseSpeed, target[1] * baseSpeed] : [0, 0];
      this.vx = lerp(this.vx, goal[0], 1 - Math.pow(0.0009, dt));
      this.vy = lerp(this.vy, goal[1], 1 - Math.pow(0.0009, dt));
    }

    // dash / teleport trigger
    if (!frozen && intents.dash && this.dashCd <= 0 && this.dashT <= 0) {
      if (this.powers.has('TELEPORT') && this.tryTeleport()) {
        // teleported to an airborne boomerang
      } else {
        const d: Vec2 = intents.move[0] || intents.move[1] ? norm(intents.move[0], intents.move[1]) : this.aim;
        this.vx = d[0] * 660;
        this.vy = d[1] * 660;
        this.dashT = 0.17;
        this.dashCd = caffeinated ? 0.22 : 0.7; // Caffeinated greatly cuts dash cooldown
        this.invuln = Math.max(this.invuln, 0.26);
        audio.dash();
        spawnDashPuff(this.x, this.y, d, this.char.body);
      }
      this.stats.dashes++;
    }

    // slash trigger — only while ARMED (mirrors Boomerang Fu's state machine)
    if (!frozen && intents.slash && this.armed && this.slashCd <= 0 && this.slashT <= 0) {
      this.slashT = SLASH_ACTIVE;
      this.slashCd = this.powers.has('EXTRA') ? SLASH_CD_FAST : SLASH_CD;
      audio.dash();
    }

    // friction during dash decay
    if (this.dashT > 0) {
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
    }

    // integrate (axis-separated so we slide along walls instead of snagging)
    this.x += this.vx * dt;
    if (this.x < BOUNDS.l + this.r) {
      this.x = BOUNDS.l + this.r;
      this.vx = 0;
    }
    if (this.x > BOUNDS.r - this.r) {
      this.x = BOUNDS.r - this.r;
      this.vx = 0;
    }
    this.y += this.vy * dt;
    if (this.y < BOUNDS.t + this.r) {
      this.y = BOUNDS.t + this.r;
      this.vy = 0;
    }
    if (this.y > BOUNDS.b - this.r) {
      this.y = BOUNDS.b - this.r;
      this.vy = 0;
    }
    resolveCircleObstacles(this);

    // throw handling
    if (!frozen) {
      if (this.isAI) {
        if (intents.throwNow && this.armed) this.doThrow(intents.charge ?? 0.6);
      } else {
        if (intents.throwHeld && this.armed) {
          this.charging = true;
          this.charge = clamp(this.charge + dt / 0.55, 0, 1);
        }
        if (!intents.throwHeld && this.charging) {
          // release
          if (this.armed) this.doThrow(this.charge);
          this.charging = false;
          this.charge = 0;
        }
        if (!this.armed) {
          this.charging = false;
          this.charge = 0;
        }
      }
    }
  }

  /** Dash → teleport to your nearest airborne boomerang and re-equip it. */
  private tryTeleport(): boolean {
    let tgt: Boomerang | null = null;
    let bd = Infinity;
    for (const b of game.boomerangs) {
      if (b.dead || !b.isMain || b.transient || b.origOwner !== this) continue;
      const d = dist(this.x, this.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        tgt = b;
      }
    }
    if (!tgt) return false;
    spawnRing(this.x, this.y, '#8affd6', 1.1);
    this.x = tgt.x;
    this.y = tgt.y;
    this.vx = 0;
    this.vy = 0;
    tgt.dead = true; // re-equipped, not lost (conserves inventory)
    this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    this.invuln = Math.max(this.invuln, 0.2);
    this.dashCd = this.powers.has('SPEED') ? 0.22 : 0.7;
    spawnRing(this.x, this.y, '#8affd6', 1.2);
    audio.catch_();
    return true;
  }

  doThrow(charge: number): void {
    charge = clamp(charge, 0.12, 1);
    const [ax, ay] = this.aim;
    const speed = 430 + charge * 230;
    const outTime = 0.42 + charge * 0.4;
    const curve = charge * MAX_CURVE; // longer hold => stronger banking curve
    const main = new Boomerang(this, ax * speed, ay * speed, outTime, true);
    main.curve = curve;
    main.big = this.powers.has('BIG');
    main.fire = this.powers.has('FIRE');
    main.ice = this.powers.has('ICE');
    main.bomb = this.powers.has('BOMB');
    main.multi = this.powers.has('MULTI');
    game.boomerangs.push(main);
    this.boomsInHand--;
    audio.throw_();
  }

  /** A boomerang of ours left play uncaught — schedule its return to hand. */
  loseBoomerang(): void {
    this.respawns.push(RESPAWN_TIME);
  }

  catchBoomerang(): void {
    this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    audio.catch_();
    spawnRing(this.x, this.y, this.char.body, 0.9);
  }

  freeze(): void {
    this.frozen = Math.max(this.frozen, 1.7);
    audio.freeze();
    spawnRing(this.x, this.y, '#bdf0ff', 1.1);
  }

  die(killer: Player | null, dirx: number, diry: number): void {
    if (!this.alive) return;
    // Shield intercepts the next lethal hit instead of dying.
    if (this.powers.has('SHIELD')) {
      this.powers.delete('SHIELD');
      this.invuln = Math.max(this.invuln, 0.6);
      this.shieldFlash = 0.4;
      audio.parry();
      spawnRing(this.x, this.y, POWERS.SHIELD.color, 1.3);
      return;
    }
    this.alive = false;
    this.stats.deaths++;
    if (killer && killer !== this) killer.stats.kills++;
    audio.slice();
    spawnSlice(this.x, this.y, this.char, dirx, diry);
    game.shake = Math.max(game.shake, 14);
    game.hitstop = Math.max(game.hitstop, 0.09);
  }

  /* ---- rendering ---- */
  draw(): void {
    if (!this.alive) return;
    const bobY = Math.sin(this.bob) * 1.8;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.r * 0.95, this.r * 0.9, this.r * 0.42, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y + bobY);

    // stacked power auras (one faint ring per active modifier)
    let ringIdx = 0;
    for (const key of this.powers) {
      const p = POWERS[key];
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.14 * Math.sin(game.time * 6 + ringIdx);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 7 + ringIdx * 3.5, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ringIdx++;
    }
    // shield pop flash
    if (this.shieldFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.shieldFlash / 0.4;
      ctx.strokeStyle = POWERS.SHIELD.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 12, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // invuln flicker
    if (this.invuln > 0 && Math.floor(game.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;

    this.char.draw(this.char, this.r, this.aim);

    // slash arc swoosh
    if (this.slashT > 0) {
      const a = Math.atan2(this.aim[1], this.aim[0]);
      const k = this.slashT / SLASH_ACTIVE;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, this.r + SLASH_RANGE * 0.7, a - SLASH_HALF, a + SLASH_HALF);
      ctx.stroke();
      ctx.strokeStyle = `rgba(180,240,255,${0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // frozen overlay
    if (this.frozen > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#bfeaff';
      roundRectPath(-this.r - 4, -this.r - 4, (this.r + 4) * 2, (this.r + 4) * 2, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#7fd2f5';
      ctx.lineWidth = 2;
      roundRectPath(-this.r - 4, -this.r - 4, (this.r + 4) * 2, (this.r + 4) * 2, 6);
      ctx.stroke();
    }
    ctx.restore();

    // boomerang-in-hand indicators + charge arc
    if (this.boomsInHand > 0) {
      const a = Math.atan2(this.aim[1], this.aim[0]);
      for (let i = 0; i < this.boomsInHand; i++) {
        const off = (i - (this.boomsInHand - 1) / 2) * 0.5;
        const hx = this.x + Math.cos(a + off) * (this.r + 9);
        const hy = this.y + bobY + Math.sin(a + off) * (this.r + 9);
        drawBoomShape(hx, hy, 7, game.time * 6, this.char.dark);
      }
      if (this.charging && this.charge > 0.05) {
        ctx.strokeStyle = `hsl(${lerp(60, 0, this.charge)},100%,60%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobY, this.r + 14, a - this.charge * 1.5, a + this.charge * 1.5);
        ctx.stroke();
      }
    }
    // respawn pip(s)
    for (let i = 0; i < this.respawns.length; i++) {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      ctx.arc(this.x + (i - (this.respawns.length - 1) / 2) * 9, this.y - this.r - 8, 3, 0, TAU * (1 - this.respawns[i] / RESPAWN_TIME));
      ctx.fill();
    }
  }
}

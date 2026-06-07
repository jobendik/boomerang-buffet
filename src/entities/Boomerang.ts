import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { dist, lerp, norm, TAU } from '../core/math';
import { BOUNDS } from '../constants';
import { OBSTACLES } from '../data/arena';
import { drawBoomShape } from '../gfx/shapes';
import { circleRect } from '../systems/collision';
import { spawnExplosion } from '../systems/effects';
import { game } from '../game/state';
import { FirePatch } from './FirePatch';
import type { Player } from './Player';

/**
 * A thrown boomerang. Flies out (optionally on a charged banking curve),
 * returns to its owner via homing, bounces off walls/obstacles, and can carry
 * BIG / FIRE / ICE / BOMB / MULTI modifiers stacked from the owner's powers.
 */
export class Boomerang {
  owner: Player;
  origOwner: Player;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: 'out' | 'return';
  outT: number;
  r: number;
  rot: number;
  isMain: boolean;
  transient: boolean;
  life: number;
  curve: number;
  big: boolean;
  fire: boolean;
  ice: boolean;
  bomb: boolean;
  multi: boolean;
  dead: boolean;
  fireT: number;
  bounceFlash: number;

  constructor(owner: Player, vx: number, vy: number, outTime: number, isMain: boolean) {
    this.owner = owner;
    this.origOwner = owner;
    this.x = owner.x + owner.aim[0] * (owner.r + 6);
    this.y = owner.y + owner.aim[1] * (owner.r + 6);
    this.vx = vx;
    this.vy = vy;
    this.phase = 'out';
    this.outT = outTime;
    this.r = 11;
    this.rot = 0;
    this.isMain = isMain;
    this.transient = false;
    this.life = 0;
    this.curve = 0;
    this.big = false;
    this.fire = false;
    this.ice = false;
    this.bomb = false;
    this.multi = false;
    this.dead = false;
    this.fireT = 0;
    this.bounceFlash = 0;
  }

  get hitR(): number {
    return this.big ? this.r + 9 : this.r;
  }

  update(dt: number): void {
    this.rot += dt * 26;
    this.bounceFlash = Math.max(0, this.bounceFlash - dt);
    if (this.transient) {
      this.life -= dt;
      if (this.life <= 0) {
        this.kill(false);
        return;
      }
    }
    const owner = this.owner;

    // charged banking curve while flying out
    if (this.phase === 'out' && this.curve) {
      const c = Math.cos(this.curve * dt);
      const s = Math.sin(this.curve * dt);
      const nvx = this.vx * c - this.vy * s;
      const nvy = this.vx * s + this.vy * c;
      this.vx = nvx;
      this.vy = nvy;
    }

    // phase / apex
    if (this.phase === 'out') {
      this.outT -= dt;
      if (this.outT <= 0 && !this.transient) {
        if (this.multi) {
          this.doSplit();
          return;
        }
        this.phase = 'return';
      }
    }
    if (this.phase === 'return' && owner.alive) {
      // steer toward owner
      const [dx, dy] = [owner.x - this.x, owner.y - this.y];
      const [nx, ny] = norm(dx, dy);
      const sp = this.big ? 430 : 540;
      const cur = Math.hypot(this.vx, this.vy) || sp;
      const tvx = nx * Math.max(cur, sp);
      const tvy = ny * Math.max(cur, sp);
      this.vx = lerp(this.vx, tvx, 1 - Math.pow(0.00005, dt));
      this.vy = lerp(this.vy, tvy, 1 - Math.pow(0.00005, dt));
    } else if (this.phase === 'return' && !owner.alive) {
      // owner dead: fly straight and despawn
      this.life = (this.life || 0.7) - dt;
      if (this.life <= 0) {
        this.kill(false);
        return;
      }
    }

    const speedMul = this.big ? 0.85 : 1;
    this.x += this.vx * dt * speedMul;
    this.y += this.vy * dt * speedMul;

    // wall bounce
    let bounced = false;
    if (this.x < BOUNDS.l + this.r) {
      this.x = BOUNDS.l + this.r;
      this.vx = Math.abs(this.vx);
      bounced = true;
    }
    if (this.x > BOUNDS.r - this.r) {
      this.x = BOUNDS.r - this.r;
      this.vx = -Math.abs(this.vx);
      bounced = true;
    }
    if (this.y < BOUNDS.t + this.r) {
      this.y = BOUNDS.t + this.r;
      this.vy = Math.abs(this.vy);
      bounced = true;
    }
    if (this.y > BOUNDS.b - this.r) {
      this.y = BOUNDS.b - this.r;
      this.vy = -Math.abs(this.vy);
      bounced = true;
    }
    if (bounced) {
      if (this.bomb) {
        this.explode();
        return;
      }
      if (this.multi && this.phase === 'out' && !this.transient) {
        this.doSplit();
        return;
      }
    }
    // obstacle bounce
    for (const R of OBSTACLES) {
      const c = circleRect(this.x, this.y, this.r, R);
      if (c.hit) {
        this.x += c.nx! * c.pen!;
        this.y += c.ny! * c.pen!;
        const dot = this.vx * c.nx! + this.vy * c.ny!;
        this.vx -= 2 * dot * c.nx!;
        this.vy -= 2 * dot * c.ny!;
        bounced = true;
        if (this.bomb) {
          this.explode();
          return;
        }
        if (this.multi && this.phase === 'out' && !this.transient) {
          this.doSplit();
          return;
        }
      }
    }
    if (bounced) {
      this.bounceFlash = 0.12;
      if (Math.random() < 0.5) audio.tick();
    }

    // fire trail drops
    if (this.fire) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.09;
        game.hazards.push(new FirePatch(this.x, this.y, this.origOwner));
      }
    }

    // catch by owner
    if (this.phase === 'return' && owner.alive && !this.transient) {
      if (dist(this.x, this.y, owner.x, owner.y) < owner.r + this.r) {
        owner.catchBoomerang();
        this.kill(false);
      }
    }
  }

  /** MULTI: burst into a fan of short-lived sub-projectiles, then expire. */
  doSplit(): void {
    if (this.dead) return;
    const n = this.fire || this.bomb ? 4 : 5; // reduced count when elemental/explosive
    const baseA = Math.atan2(this.vy, this.vx);
    const sp = 470;
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * 0.62;
      const ex = new Boomerang(this.origOwner, Math.cos(a) * sp, Math.sin(a) * sp, 0.3, false);
      ex.x = this.x;
      ex.y = this.y;
      ex.transient = true;
      ex.life = 0.6;
      ex.fire = this.fire; // sub-projectiles keep the fire trail (smaller footprint)
      game.boomerangs.push(ex);
    }
    audio.throw_();
    this.kill(true);
  }

  explode(): void {
    if (this.dead) return;
    this.dead = true;
    audio.bomb();
    game.shake = Math.max(game.shake, 16);
    spawnExplosion(this.x, this.y);
    const R = 78;
    for (const p of game.players) {
      if (p.alive && p.invuln <= 0 && dist(this.x, this.y, p.x, p.y) < R + p.r) {
        const [dx, dy] = norm(p.x - this.x, p.y - this.y);
        p.die(this.origOwner, dx, dy);
      }
    }
    if (this.isMain) this.origOwner.loseBoomerang();
  }

  kill(asLoss: boolean): void {
    if (this.dead) return;
    this.dead = true;
    if (asLoss && this.isMain) this.origOwner.loseBoomerang();
  }

  draw(): void {
    // trail
    if (this.fire) {
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.hitR + 10);
      g.addColorStop(0, 'rgba(255,200,60,.9)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 10, 0, TAU);
      ctx.fill();
    }
    if (this.ice) {
      ctx.fillStyle = 'rgba(150,230,255,.4)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 5, 0, TAU);
      ctx.fill();
    }
    if (this.bomb) {
      ctx.fillStyle = '#2a2030';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = Math.floor(game.time * 12) % 2 ? '#ffd23a' : '#ff7b3a';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, TAU);
      ctx.fill();
      return;
    }
    const s = this.big ? 16 : this.transient ? 9 : 11;
    const col = this.bounceFlash > 0 ? '#fff' : this.origOwner.char.body;
    drawBoomShape(this.x, this.y, s, this.rot, col);
  }
}

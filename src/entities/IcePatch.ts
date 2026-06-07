import { ctx } from '../core/canvas';
import { clamp, dist, rand, TAU } from '../core/math';
import { game } from '../game/state';
import { Particle } from './Particle';
import type { Player } from './Player';

/**
 * A lingering patch of ice dropped by the COOL WALK trail. Foes who step in it
 * are slowed, and continued exposure chills them solid — the freezing
 * counterpart to `FirePatch`'s contagious burn.
 */
export class IcePatch {
  x: number;
  y: number;
  owner: Player;
  life: number;
  max: number;
  r: number;

  constructor(x: number, y: number, owner: Player) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.life = 2.2;
    this.max = 2.2;
    this.r = 16;
  }

  /** @returns whether the patch is still alive after this step. */
  update(dt: number): boolean {
    this.life -= dt;
    for (const p of game.players) {
      if (
        p.alive &&
        p.invuln <= 0 &&
        this.owner.isEnemy(p) &&
        this.life > 0.2 &&
        dist(this.x, this.y, p.x, p.y) < this.r + p.r * 0.6
      ) {
        // slow on contact; prolonged exposure (tracked on the player) freezes
        p.chill();
      }
    }
    if (Math.random() < 0.3) {
      game.particles.push(
        new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-6, 6), rand(-14, -4), rand(0.4, 0.8), '#bdf0ff', rand(2, 4))
      );
    }
    return this.life > 0;
  }

  draw(): void {
    const a = clamp(this.life / this.max, 0, 1);
    ctx.save();
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    g.addColorStop(0, `rgba(180,235,255,${0.5 * a})`);
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    // a few faceted glints
    ctx.strokeStyle = `rgba(220,245,255,${0.5 * a})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * TAU + this.x * 0.1;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(ang) * this.r * 0.3, this.y + Math.sin(ang) * this.r * 0.3);
      ctx.lineTo(this.x + Math.cos(ang) * this.r * 0.75, this.y + Math.sin(ang) * this.r * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }
}

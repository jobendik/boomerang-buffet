import { ctx } from '../core/canvas';
import { clamp, rand, TAU } from '../core/math';
import { roundRectPath } from '../gfx/shapes';

export type ParticleKind = 'spark' | 'chunk' | 'ring';

/** A short-lived visual effect particle (spark, food chunk, or expanding ring). */
export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: ParticleKind;
  rot: number;
  vr: number;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: string,
    size: number,
    kind: ParticleKind = 'spark'
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.max = life;
    this.color = color;
    this.size = size;
    this.kind = kind;
    this.rot = rand(0, TAU);
    this.vr = rand(-8, 8);
  }

  /** @returns whether the particle is still alive after this step. */
  update(dt: number): boolean {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.1, dt);
    this.vy = this.vy * Math.pow(0.1, dt) + (this.kind === 'chunk' ? 600 * dt : 0);
    this.rot += this.vr * dt;
    return this.life > 0;
  }

  draw(): void {
    const a = clamp(this.life / this.max, 0, 1);
    ctx.globalAlpha = a;
    if (this.kind === 'chunk') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      roundRectPath(-this.size / 2, -this.size / 2, this.size, this.size, this.size * 0.3);
      ctx.fill();
      ctx.restore();
    } else if (this.kind === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, (1 - a) * this.size + 4, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

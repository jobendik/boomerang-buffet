import { ctx } from '../core/canvas';
import { clamp, rand, TAU } from '../core/math';
import { roundRectPath } from '../gfx/shapes';
import { fontD } from '../ui/widgets';
import { setFace } from '../data/characters';
import type { Char, Vec2 } from '../types';

export type ParticleKind = 'spark' | 'chunk' | 'ring' | 'text' | 'confetti' | 'half' | 'ghost' | 'streak' | 'flash' | 'cut' | 'soul';

/** A short-lived visual effect particle (spark, food chunk, expanding ring,
 *  floating popup text, a fluttering confetti snip, a tumbling sliced body
 *  half, or a fading dash afterimage). */
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
  text: string;
  /* extra payload for the character-bearing kinds ('half' & 'ghost') */
  char: Char | null;
  aimV: Vec2;
  sliceA: number; // 'half': angle of the cut line through the body
  side: number; // 'half': which half-plane of the cut this piece keeps

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: string,
    size: number,
    kind: ParticleKind = 'spark',
    text = ''
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
    this.text = text;
    this.rot = rand(0, TAU);
    this.vr = rand(-8, 8);
    this.char = null;
    this.aimV = [1, 0];
    this.sliceA = 0;
    this.side = 1;
  }

  /** @returns whether the particle is still alive after this step. */
  update(dt: number): boolean {
    this.life -= dt;
    if (this.kind === 'ghost' || this.kind === 'flash' || this.kind === 'cut') return this.life > 0; // holds its pose, just fades
    if (this.kind === 'soul') {
      // a departing spirit: wafts upward with a lazy sway
      this.y += this.vy * dt;
      this.x += Math.sin(this.life * 7) * 22 * dt;
      return this.life > 0;
    }
    if (this.kind === 'half') {
      // a sliced body half: sails apart from the cut, tumbling under gravity
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(0.5, dt);
      this.vy += 460 * dt;
      this.rot += this.vr * dt;
      return this.life > 0;
    }
    if (this.kind === 'confetti') {
      // flutter: gentle fall + sideways sway, light drag
      this.rot += this.vr * dt;
      this.x += (this.vx + Math.sin(this.rot * 2) * 26) * dt;
      this.y += this.vy * dt;
      this.vy = Math.min(this.vy + 240 * dt, 120);
      this.vx *= Math.pow(0.4, dt);
      return this.life > 0;
    }
    if (this.kind === 'text') {
      // pop up, then hang while fading
      this.y += this.vy * dt;
      this.vy *= Math.pow(0.05, dt);
      return this.life > 0;
    }
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
    if (this.kind === 'half' && this.char) {
      // one half of a sliced fighter: the full character clipped to a
      // half-plane along the cut, with a pale band suggesting the cut face
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2.2);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      const S = this.size * 2.4;
      ctx.rotate(this.sliceA);
      ctx.beginPath();
      ctx.rect(-S, this.side < 0 ? -S : 0, S * 2, S);
      ctx.rotate(-this.sliceA);
      ctx.clip();
      this.char.draw(this.char, this.size, this.aimV);
      ctx.rotate(this.sliceA);
      ctx.fillStyle = 'rgba(255,243,223,.9)';
      ctx.fillRect(-this.size * 0.85, this.side < 0 ? -3 : 0, this.size * 1.7, 3);
      ctx.restore();
    } else if (this.kind === 'ghost' && this.char) {
      // dash afterimage: a translucent snapshot of the fighter, frozen mid-bolt
      ctx.save();
      ctx.globalAlpha = a * 0.35;
      ctx.translate(this.x, this.y);
      this.char.draw(this.char, this.size, this.aimV);
      ctx.restore();
    } else if (this.kind === 'soul' && this.char) {
      // the departed, drifting heavenward: a pale see-through copy with a halo
      const k = 1 - this.life / this.max;
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, a * 1.2) * Math.min(1, k * 6);
      ctx.translate(this.x, this.y);
      ctx.scale(0.8, 0.8);
      setFace('ko');
      this.char.draw(this.char, this.size, [0, -0.4]);
      setFace('idle');
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -this.size * 1.45, this.size * 0.6, this.size * 0.2, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (this.kind === 'streak') {
      // a spark drawn as a short line along its velocity
      const l = Math.hypot(this.vx, this.vy) || 1;
      const len = Math.min(18, l * 0.045) * a;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * a;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - (this.vx / l) * len, this.y - (this.vy / l) * len);
      ctx.stroke();
    } else if (this.kind === 'flash') {
      // a four-point hit star that snaps open and vanishes
      const k = 1 - a;
      const R = this.size * (0.5 + k * 0.7);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        const rr = i % 2 ? R * 0.22 : i % 4 === 0 ? R : R * 0.55;
        ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (this.kind === 'cut') {
      // the slice itself: a long white sliver along the blow, there for a blink
      const k = 1 - a;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      const L = this.size * (0.5 + k * 0.9);
      const Wd = 5 * a + 0.5;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.quadraticCurveTo(0, -Wd, L, 0);
      ctx.quadraticCurveTo(0, Wd, -L, 0);
      ctx.fill();
      ctx.restore();
    } else if (this.kind === 'chunk') {
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
    } else if (this.kind === 'text') {
      // a touch of overshoot as the popup lands
      const k = 1 - this.life / this.max;
      const scale = k < 0.18 ? 0.6 + (k / 0.18) * 0.55 : 1.15 - Math.min(0.15, (k - 0.18) * 0.5);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);
      ctx.font = fontD(this.size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = this.size * 0.22;
      ctx.strokeStyle = '#140c20';
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.strokeText(this.text, 0, 0);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    } else if (this.kind === 'confetti') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(this.rot * 3))); // tumbling foreshorten
      ctx.fillStyle = this.color;
      roundRectPath(-this.size / 2, -this.size / 3, this.size, this.size * 0.66, 1.5);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

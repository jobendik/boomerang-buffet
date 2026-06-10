import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { clamp, dist, rand, TAU } from '../core/math';
import { POWERS, type PowerKey } from '../data/powers';
import { drawPowerIcon } from '../gfx/icons';
import { roundRectPath } from '../gfx/shapes';
import { game } from '../game/state';
import { spawnRing } from '../systems/effects';

/** A floating power book the fighters can walk over to collect. */
export class Pickup {
  x: number;
  y: number;
  type: PowerKey;
  r: number;
  t: number;
  life: number;
  bob: number;

  constructor(x: number, y: number, type: PowerKey) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.r = 16;
    this.t = 0;
    this.life = 13;
    this.bob = rand(0, TAU);
  }

  /** @returns whether the pickup should remain in play after this step. */
  update(dt: number): boolean {
    this.t += dt;
    this.life -= dt;
    this.bob += dt * 3;
    for (const p of game.players) {
      if (p.alive && dist(this.x, this.y, p.x, p.y) < this.r + p.r) {
        p.applyPower(this.type);
        audio.power();
        spawnRing(p.x, p.y, POWERS[this.type].color, 1.2);
        // surface what the human just grabbed (name + what it does)
        if (!p.isAI) game.toasts.push({ key: this.type, t: 0 });
        return false;
      }
    }
    return this.life > 0;
  }

  draw(): void {
    const P = POWERS[this.type];
    const pop = clamp(this.t / 0.3, 0, 1); // spawn-in overshoot
    const scale = pop < 1 ? 0.5 + pop * 0.62 - Math.max(0, pop - 0.7) * 0.4 : 1;
    const y = this.y + Math.sin(this.bob) * 4;
    const blink = this.life < 3 && Math.floor(this.t * 8) % 2 === 0;
    if (blink) return;
    ctx.save();
    // grounded shadow (stays put while the book bobs)
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 17, 13 * scale, 4.5 * scale, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, y);
    ctx.scale(scale, scale);
    ctx.rotate(Math.sin(this.bob * 0.7) * 0.06);
    // soft coloured halo
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
    halo.addColorStop(0, P.color + '55');
    halo.addColorStop(1, P.color + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    // the book: page block behind, tinted cover in front
    ctx.fillStyle = '#fff3df';
    roundRectPath(-12, -13.5, 26, 29, 4);
    ctx.fill();
    ctx.fillStyle = P.color;
    roundRectPath(-14, -15, 26, 29, 4);
    ctx.fill();
    const sheen = ctx.createLinearGradient(0, -15, 0, 14);
    sheen.addColorStop(0, 'rgba(255,255,255,.32)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    roundRectPath(-14, -15, 26, 29, 4);
    ctx.fill();
    // spine groove
    ctx.strokeStyle = 'rgba(20,12,32,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -15);
    ctx.lineTo(-11, 14);
    ctx.stroke();
    // emblem panel + the power's icon
    ctx.fillStyle = 'rgba(20,12,32,.8)';
    roundRectPath(-7.5, -9.5, 17, 17, 4);
    ctx.fill();
    drawPowerIcon(this.type, 1, -1, 6, '#fff3df');
    // a sparkle drifting around fresh books
    if (this.life > 4) {
      const sa = this.bob * 1.7;
      const sx = Math.cos(sa) * 20;
      const sy = Math.sin(sa) * 16 - 4;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sa);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.lineTo(Math.cos(a) * 3.2, Math.sin(a) * 3.2);
        ctx.lineTo(Math.cos(a + TAU / 8) * 1.1, Math.sin(a + TAU / 8) * 1.1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

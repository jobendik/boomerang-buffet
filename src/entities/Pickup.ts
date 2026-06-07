import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { dist, rand, TAU } from '../core/math';
import { POWERS, type PowerKey } from '../data/powers';
import { roundRectPath } from '../gfx/shapes';
import { game } from '../game/state';
import { spawnRing } from '../systems/effects';

/** A floating power-up capsule the players can walk over to collect. */
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
        return false;
      }
    }
    return this.life > 0;
  }

  draw(): void {
    const P = POWERS[this.type];
    const y = this.y + Math.sin(this.bob) * 4;
    const blink = this.life < 3 && Math.floor(this.t * 8) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 16, 14, 5, 0, 0, TAU);
    ctx.fill();
    // capsule
    ctx.translate(this.x, y);
    ctx.shadowColor = P.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fff8ec';
    roundRectPath(-15, -15, 30, 30, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = P.color;
    roundRectPath(-15, -15, 30, 30, 9);
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.color;
    ctx.lineWidth = 3;
    roundRectPath(-15, -15, 30, 30, 9);
    ctx.stroke();
    ctx.fillStyle = '#3a2030';
    ctx.font = '700 18px "Trebuchet MS",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(P.icon, 0, 1);
    ctx.restore();
  }
}

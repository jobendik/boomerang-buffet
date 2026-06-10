import { ctx } from '../core/canvas';
import { TAU } from '../core/math';
import { BOUNDS } from '../constants';
import { game } from '../game/state';
import { circleRect, resolveCircleObstacles } from '../systems/collision';
import { roundRectPath } from '../gfx/shapes';
import type { CrusherDef } from '../types';

/**
 * A kinematic crushing block. It eases back and forth along its travel vector
 * on a sine cycle and acts as a solid wall (see `resolveCrushers`). When the
 * moving block traps a fighter against the static world, they're squished — an
 * environmental death credited to no one (feeds the "Trash Compactor" award).
 */
export class Crusher {
  // base (retracted) position
  bx: number;
  by: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  period: number;
  t: number;
  // live (extended) position, updated each frame
  x: number;
  y: number;

  constructor(def: CrusherDef) {
    this.bx = def.x;
    this.by = def.y;
    this.w = def.w;
    this.h = def.h;
    this.dx = def.dx;
    this.dy = def.dy;
    this.period = def.period;
    this.t = (def.phase ?? 0) * def.period;
    this.x = def.x;
    this.y = def.y;
  }

  update(dt: number): void {
    this.t += dt;
    const u = (1 - Math.cos((this.t / this.period) * TAU)) / 2; // 0→1→0 eased
    this.x = this.bx + this.dx * u;
    this.y = this.by + this.dy * u;

    // shove out (and possibly crush) any fighter the block now overlaps
    for (const p of game.players) {
      if (!p.alive) continue;
      const hit = circleRect(p.x, p.y, p.r, this);
      if (!hit.hit) continue;
      // push along the block's surface normal, then re-settle vs the static world
      p.x += hit.nx! * hit.pen!;
      p.y += hit.ny! * hit.pen!;
      resolveCircleObstacles(p);
      p.x = Math.max(BOUNDS.l + p.r, Math.min(BOUNDS.r - p.r, p.x));
      p.y = Math.max(BOUNDS.t + p.r, Math.min(BOUNDS.b - p.r, p.y));
      // still deeply embedded? they had nowhere to go — squish.
      const after = circleRect(p.x, p.y, p.r, this);
      if (after.hit && after.pen! > 3 && p.invuln <= 0) p.crush();
    }
  }

  /** Faint groove showing the block's travel path (drawn under fighters). */
  drawTrack(): void {
    ctx.save();
    const x0 = Math.min(this.bx, this.bx + this.dx);
    const y0 = Math.min(this.by, this.by + this.dy);
    const x1 = Math.max(this.bx + this.w, this.bx + this.dx + this.w);
    const y1 = Math.max(this.by + this.h, this.by + this.dy + this.h);
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    roundRectPath(x0, y0, x1 - x0, y1 - y0, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,206,84,.18)';
    ctx.lineWidth = 1.5;
    roundRectPath(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2, 7);
    ctx.stroke();
    // guide rail down the travel axis, so the groove reads "machine", not "pit"
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    if (Math.abs(this.dx) > Math.abs(this.dy)) {
      ctx.moveTo(x0 + 8, this.by + this.h / 2);
      ctx.lineTo(x1 - 8, this.by + this.h / 2);
    } else {
      ctx.moveTo(this.bx + this.w / 2, y0 + 8);
      ctx.lineTo(this.bx + this.w / 2, y1 - 8);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The block itself, with hazard stripes (drawn over fighters so it squishes). */
  draw(): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRectPath(this.x + 4, this.y + 6, this.w, this.h, 8);
    ctx.fill();
    ctx.fillStyle = '#6b6470';
    roundRectPath(this.x, this.y, this.w, this.h, 8);
    ctx.fill();
    ctx.fillStyle = '#837c8c';
    roundRectPath(this.x + 5, this.y + 5, this.w - 10, this.h - 10, 6);
    ctx.fill();
    // yellow/black hazard chevrons
    ctx.save();
    roundRectPath(this.x + 5, this.y + 5, this.w - 10, this.h - 10, 6);
    ctx.clip();
    ctx.strokeStyle = '#ffce54';
    ctx.lineWidth = 6;
    for (let o = -this.h; o < this.w; o += 16) {
      ctx.beginPath();
      ctx.moveTo(this.x + o, this.y + this.h);
      ctx.lineTo(this.x + o + this.h, this.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#2a2230';
    ctx.lineWidth = 2;
    roundRectPath(this.x, this.y, this.w, this.h, 8);
    ctx.stroke();
    ctx.restore();
  }
}

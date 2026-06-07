import { ctx } from '../core/canvas';
import { W, H, WALL } from '../constants';
import { OBSTACLES } from '../data/arena';
import { roundRectPath } from '../gfx/shapes';

/** Draws the static arena: floor, vignette, walls and diner-counter obstacles. */
export function drawArena(): void {
  // floor checker
  const tile = 64;
  for (let y = WALL; y < H - WALL; y += tile) {
    for (let x = WALL; x < W - WALL; x += tile) {
      const c = (((x / tile) | 0) + ((y / tile) | 0)) % 2;
      ctx.fillStyle = c ? '#33263f' : '#2d2138';
      ctx.fillRect(x, y, Math.min(tile, W - WALL - x), Math.min(tile, H - WALL - y));
    }
  }
  // soft vignette glow center
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 540);
  g.addColorStop(0, 'rgba(255,210,120,.05)');
  g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g;
  ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  // walls (border)
  ctx.fillStyle = '#1a1226';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);
  ctx.strokeStyle = '#ffce54';
  ctx.lineWidth = 4;
  ctx.strokeRect(WALL - 2, WALL - 2, W - (WALL - 2) * 2, H - (WALL - 2) * 2);

  // obstacles (diner counters)
  for (const R of OBSTACLES) {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    roundRectPath(R.x + 4, R.y + 6, R.w, R.h, 12);
    ctx.fill();
    ctx.fillStyle = '#4a3358';
    roundRectPath(R.x, R.y, R.w, R.h, 12);
    ctx.fill();
    ctx.fillStyle = '#5e4170';
    roundRectPath(R.x + 5, R.y + 5, R.w - 10, R.h - 10, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,206,84,.35)';
    ctx.lineWidth = 2;
    roundRectPath(R.x, R.y, R.w, R.h, 12);
    ctx.stroke();
  }
}

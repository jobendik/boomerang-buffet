import { ctx } from '../core/canvas';
import { W, H, WALL } from '../constants';
import { arena, OBSTACLES, PITS, PORTALS, BUSHES } from '../data/arena';
import { game } from '../game/state';
import { roundRectPath } from '../gfx/shapes';
import { TAU } from '../core/math';

/** Draws the static arena: floor, vignette, walls, hazards and obstacles. */
export function drawArena(): void {
  // floor checker (per-arena palette)
  const tile = 64;
  for (let y = WALL; y < H - WALL; y += tile) {
    for (let x = WALL; x < W - WALL; x += tile) {
      const c = (((x / tile) | 0) + ((y / tile) | 0)) % 2;
      ctx.fillStyle = c ? arena.floorA : arena.floorB;
      ctx.fillRect(x, y, Math.min(tile, W - WALL - x), Math.min(tile, H - WALL - y));
    }
  }
  // soft vignette glow center
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 540);
  g.addColorStop(0, 'rgba(255,210,120,.05)');
  g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g;
  ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  // bottomless pits — dark voids rimmed with a thin highlight
  for (const P of PITS) {
    ctx.fillStyle = '#0b0712';
    roundRectPath(P.x, P.y, P.w, P.h, 14);
    ctx.fill();
    const pg = ctx.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 4, P.x + P.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) / 1.5);
    pg.addColorStop(0, 'rgba(0,0,0,.85)');
    pg.addColorStop(1, 'rgba(20,12,28,0)');
    ctx.fillStyle = pg;
    roundRectPath(P.x, P.y, P.w, P.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,150,.5)';
    ctx.lineWidth = 2;
    roundRectPath(P.x, P.y, P.w, P.h, 14);
    ctx.stroke();
  }

  // teleporter pads — twin glowing rings, pulsing in sync
  for (const P of PORTALS) {
    for (const node of [[P.ax, P.ay], [P.bx, P.by]] as const) {
      const pulse = P.r + Math.sin(game.time * 4) * 3;
      ctx.save();
      ctx.translate(node[0], node[1]);
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, pulse + 8);
      rg.addColorStop(0, 'rgba(150,255,214,.45)');
      rg.addColorStop(1, 'rgba(60,200,160,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, pulse + 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8affd6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // walls (border)
  ctx.fillStyle = '#1a1226';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);
  ctx.strokeStyle = arena.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(WALL - 2, WALL - 2, W - (WALL - 2) * 2, H - (WALL - 2) * 2);

  // bushes — leafy cover zones (drawn under fighters; hiding dims the fighter)
  for (const B of BUSHES) {
    const cx = B.x + B.w / 2;
    const cy = B.y + B.h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(46,82,38,.85)';
    const blobs = 7;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU;
      const rx = cx + Math.cos(a) * B.w * 0.32;
      const ry = cy + Math.sin(a) * B.h * 0.32;
      ctx.beginPath();
      ctx.arc(rx, ry, B.w * 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(78,128,56,.92)';
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU + 0.4 + Math.sin(game.time * 1.3 + i) * 0.04;
      const rx = cx + Math.cos(a) * B.w * 0.24;
      const ry = cy + Math.sin(a) * B.h * 0.22;
      ctx.beginPath();
      ctx.arc(rx, ry, B.w * 0.26, 0, TAU);
      ctx.fill();
    }
    // a few brighter leaf highlights
    ctx.fillStyle = 'rgba(120,170,80,.5)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 1.1;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * B.w * 0.18, cy + Math.sin(a) * B.h * 0.16, B.w * 0.1, B.h * 0.06, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

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

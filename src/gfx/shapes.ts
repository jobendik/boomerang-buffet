import { ctx } from '../core/canvas';

/** Low-level reusable canvas shape helpers. */

/** Build a rounded-rectangle path on the shared context (does not fill/stroke). */
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw a spinning boomerang glyph at (x, y). */
export function drawBoomShape(x: number, y: number, s: number, rot: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s, -s);
  ctx.quadraticCurveTo(0, -s * 0.2, s, -s);
  ctx.quadraticCurveTo(s * 0.2, 0, s, s);
  ctx.quadraticCurveTo(0, s * 0.2, -s, s);
  ctx.quadraticCurveTo(-s * 0.2, 0, -s, -s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

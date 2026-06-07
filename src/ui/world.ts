import { ctx } from '../core/canvas';
import { TAU } from '../core/math';
import { W, H, WALL } from '../constants';
import { game } from '../game/state';
import { drawBoomShape, drawProp } from '../gfx/shapes';
import { drawArena } from './arena';

/** Slanting rain + a cool tint, when the weather has turned. */
function drawRain(): void {
  ctx.save();
  // cool wash over the play area
  ctx.fillStyle = 'rgba(90,130,180,.1)';
  ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
  // streaks: a scrolling deterministic field (no Math.random per frame)
  ctx.strokeStyle = 'rgba(180,210,240,.32)';
  ctx.lineWidth = 1.5;
  const t = game.time;
  for (let i = 0; i < 90; i++) {
    const seed = i * 97.13;
    const x = ((seed * 13.7) % (W - WALL * 2)) + WALL;
    const y = (((seed * 29.3 + t * 760) % (H - WALL * 2)) + (H - WALL * 2)) % (H - WALL * 2) + WALL;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 14);
    ctx.stroke();
  }
  ctx.restore();
}

/** The Golden Boomerang artifact (Golden mode only). */
function drawGolden(): void {
  const g = game.golden;
  if (!g) return;
  const y = g.y + Math.sin(g.bob * 2.5) * (g.carrier ? 0 : 4);
  ctx.save();
  ctx.shadowColor = '#ffd23a';
  ctx.shadowBlur = 22;
  // halo
  const rg = ctx.createRadialGradient(g.x, y, 2, g.x, y, 30);
  rg.addColorStop(0, 'rgba(255,210,58,.6)');
  rg.addColorStop(1, 'rgba(255,210,58,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(g.x, y, 30, 0, TAU);
  ctx.fill();
  drawBoomShape(g.x, y, 15, g.bob * 7, '#ffd23a');
  ctx.restore();
}

/** Draws the live play-field: arena + all entities, depth-sorted by y. */
export function drawWorld(): void {
  drawArena();
  // crusher travel grooves sit on the floor, under everything
  for (const c of game.crushers) c.drawTrack();
  // Hide & Seek decoy props — visually identical to a disguised hider
  for (const d of game.hsDecoys) {
    ctx.save();
    ctx.translate(d.x, d.y);
    drawProp(d.propIdx, 19);
    ctx.restore();
  }
  // hazards under players
  for (const h of game.hazards) h.draw();
  // pickups
  for (const pk of game.pickups) pk.draw();
  if (game.golden && !game.golden.carrier) drawGolden();
  // players
  const sorted = [...game.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) p.draw();
  // crusher blocks ride above fighters, so the squished vanish beneath them
  for (const c of game.crushers) c.draw();
  // a carried artifact rides above its holder
  if (game.golden && game.golden.carrier) drawGolden();
  // boomerangs on top
  for (const b of game.boomerangs) b.draw();
  // particles
  for (const p of game.particles) p.draw();
  // weather overlay last, over the whole field
  if (game.raining) drawRain();
}

import { ctx } from '../core/canvas';
import { TAU } from '../core/math';
import { game } from '../game/state';
import { drawBoomShape } from '../gfx/shapes';
import { drawArena } from './arena';

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
  // hazards under players
  for (const h of game.hazards) h.draw();
  // pickups
  for (const pk of game.pickups) pk.draw();
  if (game.golden && !game.golden.carrier) drawGolden();
  // players
  const sorted = [...game.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) p.draw();
  // a carried artifact rides above its holder
  if (game.golden && game.golden.carrier) drawGolden();
  // boomerangs on top
  for (const b of game.boomerangs) b.draw();
  // particles
  for (const p of game.particles) p.draw();
}

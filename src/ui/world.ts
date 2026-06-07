import { game } from '../game/state';
import { drawArena } from './arena';

/** Draws the live play-field: arena + all entities, depth-sorted by y. */
export function drawWorld(): void {
  drawArena();
  // hazards under players
  for (const h of game.hazards) h.draw();
  // pickups
  for (const pk of game.pickups) pk.draw();
  // players
  const sorted = [...game.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) p.draw();
  // boomerangs on top
  for (const b of game.boomerangs) b.draw();
  // particles
  for (const p of game.particles) p.draw();
}

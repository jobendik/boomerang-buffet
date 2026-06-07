import { clearInputEdges, mouse } from '../core/input';
import { game } from './state';
import { update } from './update';
import { render } from './render';
import { handleMenuClick } from '../ui/menu';

/** The requestAnimationFrame loop: fixed-cap dt, input edge handling, draw. */

let last = performance.now();

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.033);

  // global click handling for menus
  if (mouse.downEdge) {
    if (game.state === 'menu') handleMenuClick();
    else if (game.state === 'matchover') {
      game.state = 'menu';
      game.matchWinner = null;
    }
  }

  update(dt);
  render();

  clearInputEdges();
  requestAnimationFrame(frame);
}

/** Kick off the main loop. */
export function startGame(): void {
  last = performance.now();
  requestAnimationFrame(frame);
}

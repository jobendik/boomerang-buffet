import { clearInputEdges, keys, mouse } from '../core/input';
import { audio } from '../core/audio';
import { game } from './state';
import { update } from './update';
import { render } from './render';
import { handleMenuClick, handleMatchOverClick, handlePauseClick } from '../ui/menu';

/** The requestAnimationFrame loop: fixed-cap dt, input edge handling, draw. */

let last = performance.now();

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.033);

  // Esc: pause the action / back out of menu sub-pages
  if (keys['Escape_edge']) {
    if (game.state === 'playing' || game.state === 'countdown' || game.state === 'roundover') {
      game.paused = !game.paused;
      if (game.paused) audio.pauseOpen();
      else audio.pauseClose();
      audio.setPauseDuck(game.paused); // music sinks underwater while paused
    } else if (game.state === 'menu' && game.menuPage !== 'title') {
      game.menuPage = 'title';
      audio.uiBack();
    }
  }

  // global click handling for menus & overlays
  if (mouse.downEdge) {
    if (game.paused) handlePauseClick();
    else if (game.state === 'menu') handleMenuClick();
    else if (game.state === 'matchover') handleMatchOverClick();
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

import { clearInputEdges, keys, mouse, pollPadEdges } from '../core/input';
import { audio } from '../core/audio';
import { game } from './state';
import { update } from './update';
import { render } from './render';
import { handleMenuClick, handleMatchOverClick, handlePauseClick, joinWithScheme, menuConfirm } from '../ui/menu';

/** The requestAnimationFrame loop: fixed-cap dt, input edge handling, draw. */

let last = performance.now();
let overT = 0; // seconds the match-over screen has been up

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.033);

  // couch-friendly menus: Enter / gamepad Start confirms the screen that's
  // up, Circle/B backs out, and on the setup screen a throw press on any
  // unclaimed device (Ⓐ on a pad, V for WASD, comma for IJKL) joins the lobby
  const pad = pollPadEdges();
  const inMatch = game.state === 'playing' || game.state === 'countdown' || game.state === 'roundover';
  if (game.state === 'matchover') overT += dt;
  else overT = 0;
  if (game.state === 'menu' && game.menuPage === 'setup') {
    for (const n of pad.confirm) joinWithScheme(3 + n);
    if (keys['KeyV_edge']) joinWithScheme(1);
    if (keys['Comma_edge']) joinWithScheme(2);
  }
  const confirm = keys['Enter_edge'] || pad.start || (pad.confirm.length > 0 && !(game.state === 'menu' && game.menuPage === 'setup'));
  // (the podium ignores presses for a beat, so button-mashing through the
  // final round doesn't skip the celebration)
  if (confirm && !game.paused && !inMatch && (game.state !== 'matchover' || overT > 1.5)) menuConfirm();

  // Esc / Start: pause the action · Esc / B: back out of menu sub-pages
  if (keys['Escape_edge'] || (pad.start && inMatch) || (pad.back && !inMatch)) {
    if (inMatch) {
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

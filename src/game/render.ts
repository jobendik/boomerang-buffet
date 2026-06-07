import { ctx } from '../core/canvas';
import { W, H } from '../constants';
import { clamp, rand } from '../core/math';
import { game } from './state';
import { drawMenu, drawMatchOver } from '../ui/menu';
import { drawWorld } from '../ui/world';
import { drawHUD, drawCenterText } from '../ui/hud';

/** Top-level frame renderer: dispatches per game phase + screen shake. */
export function render(): void {
  ctx.clearRect(0, 0, W, H);
  // shake
  ctx.save();
  if (game.shake > 0.2) ctx.translate(rand(-1, 1) * game.shake, rand(-1, 1) * game.shake);

  if (game.state === 'menu') {
    drawMenu();
    ctx.restore();
    return;
  }
  if (game.state === 'matchover') {
    drawMatchOver();
    ctx.restore();
    return;
  }

  drawWorld();
  drawHUD();

  if (game.state === 'countdown') {
    const n = Math.ceil(game.countdownT - 0.2);
    if (game.countdownT > 0.2) {
      const frac = game.countdownT % 1;
      ctx.globalAlpha = clamp(frac * 1.5, 0, 1);
      drawCenterText(n > 0 ? String(n) : 'GO!', '', '#ffce54');
      ctx.globalAlpha = 1;
    } else {
      drawCenterText('GO!', '', '#7ad06d');
    }
  }
  // Hide & Seek: the seeker's view is blacked out while the hiders scatter
  if (game.state === 'playing' && game.mode === 3 && game.hsSetup > 0) {
    ctx.fillStyle = 'rgba(8,5,12,.97)';
    ctx.fillRect(0, 0, W, H);
    drawCenterText(String(Math.ceil(game.hsSetup)), 'NO PEEKING — HIDERS ARE HIDING…', '#ffce54');
  }

  if (game.state === 'roundover') {
    ctx.fillStyle = 'rgba(20,12,28,.45)';
    ctx.fillRect(0, 0, W, H);
    if (game.mode === 3) {
      const seekerWon = !!game.roundWinner && game.roundWinner.role === 'seeker';
      drawCenterText(seekerWon ? 'SEEKER WINS!' : 'HIDERS WIN!', null, seekerWon ? '#ff7ad0' : '#7ad06d');
    } else if (game.roundWinner) {
      drawCenterText(
        (game.roundWinner.isAI ? 'CPU ' + game.roundWinner.char.name : 'YOU') + ' SCORES!',
        null,
        game.roundWinner.char.body
      );
    } else {
      drawCenterText('DRAW!', null, '#caa9dd');
    }
  }
  ctx.restore();
}

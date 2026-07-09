import { canvas, ctx } from '../core/canvas';
import { W, H } from '../constants';
import { clamp, rand, TAU } from '../core/math';
import { mouse } from '../core/input';
import { arena } from '../data/arena';
import { game } from './state';
import { drawMenu, drawMatchOver, drawPause } from '../ui/menu';
import { drawWorld } from '../ui/world';
import { drawHUD, drawCenterText, drawStandings } from '../ui/hud';
import { fontD, pill, UI } from '../ui/widgets';

/** Custom crosshair drawn at the mouse while the match runs. */
function drawReticle(): void {
  const me = game.players.find((p) => !p.isAI);
  const col = me && me.alive ? me.char.body : 'rgba(255,243,223,.8)';
  const charge = me && me.alive ? me.charge : 0;
  ctx.save();
  ctx.translate(mouse.x, mouse.y);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,.7)';
  ctx.shadowBlur = 3;
  const r = 9 + charge * 3;
  // four arc segments rotate gently; gaps read as a crosshair
  const spin = game.time * 0.8;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i / 4) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, r, a + 0.28, a + TAU / 4 - 0.28);
    ctx.stroke();
  }
  // charge fill ring
  if (charge > 0.05) {
    ctx.strokeStyle = `hsl(${90 - charge * 90},100%,62%)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + charge * TAU);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Top-level frame renderer: dispatches per game phase + screen shake. */
export function render(): void {
  ctx.clearRect(0, 0, W, H);
  // shake
  ctx.save();
  if (game.shake > 0.2 && !game.paused) ctx.translate(rand(-1, 1) * game.shake, rand(-1, 1) * game.shake);

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
  // blink of blast light over the field (HUD stays crisp above it)
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,240,214,${(game.flash / 0.14) * 0.26})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawHUD();

  if (game.state === 'countdown') {
    // arena intro: name + flavour while the clock winds down
    pill(W / 2, H / 2 - 120, `${arena.name.toUpperCase()} — ${arena.tagline}`, 14, UI.cream);
    const n = Math.ceil(game.countdownT - 0.2);
    const frac = game.countdownT % 1;
    if (game.countdownT > 0.2) {
      // each tick pops in slightly oversized then settles
      const k = 1 - frac;
      const scale = 1 + Math.max(0, 0.35 - k * 1.6);
      ctx.save();
      ctx.translate(W / 2, H / 2 - 6);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(H / 2 - 6));
      ctx.globalAlpha = clamp(frac * 1.5, 0, 1);
      drawCenterText(n > 0 ? String(n) : 'GO!', null, UI.gold);
      ctx.restore();
    } else {
      drawCenterText('GO!', null, UI.green);
    }
  }

  // "FIGHT!" splash as control is handed over
  if (game.state === 'playing' && game.fightT > 0) {
    const k = 1 - game.fightT / 0.8; // 0 → 1 over the splash
    const scale = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.6);
    ctx.save();
    ctx.globalAlpha = game.fightT < 0.25 ? game.fightT / 0.25 : 1;
    ctx.translate(W / 2, H / 2 - 60);
    ctx.scale(scale, scale);
    ctx.font = fontD(64);
    ctx.textAlign = 'center';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = UI.ink;
    ctx.strokeText('FIGHT!', 0, 0);
    ctx.fillStyle = UI.red;
    ctx.fillText('FIGHT!', 0, 0);
    ctx.restore();
  }

  // Hide & Seek: the seeker's view is blacked out while the hiders scatter
  if (game.state === 'playing' && game.mode === 3 && game.hsSetup > 0) {
    ctx.fillStyle = 'rgba(8,5,12,.97)';
    ctx.fillRect(0, 0, W, H);
    drawCenterText(String(Math.ceil(game.hsSetup)), 'NO PEEKING — HIDERS ARE HIDING…', UI.gold);
  }

  if (game.state === 'roundover') {
    ctx.fillStyle = 'rgba(20,12,28,.5)';
    ctx.fillRect(0, 0, W, H);
    // the round winner takes a happy bow above the banner
    if (game.roundWinner) {
      const rw = game.roundWinner;
      const hop = Math.abs(Math.sin(game.time * 4.2)) * 14;
      const land = 1 - Math.abs(Math.sin(game.time * 4.2)); // squash on touchdown
      ctx.save();
      ctx.translate(W / 2, H / 2 - 128 - hop);
      ctx.scale(1.35 * (1 + land * 0.1), 1.35 * (1 - land * 0.1));
      rw.char.draw(rw.char, 18, [0, 0.3]);
      ctx.restore();
    }
    if (game.mode === 3) {
      const seekerWon = !!game.roundWinner && game.roundWinner.role === 'seeker';
      drawCenterText(seekerWon ? 'SEEKER WINS!' : 'HIDERS WIN!', null, seekerWon ? '#ff7ad0' : UI.green);
    } else if (game.roundWinner) {
      drawCenterText(
        (game.roundWinner.isAI ? game.roundWinner.char.name : 'YOU') + (game.roundWinner.isAI ? ' SCORES!' : ' SCORE!'),
        null,
        game.roundWinner.char.body
      );
    } else {
      drawCenterText('DRAW!', null, UI.dim);
    }
    // current standings, so the race to the target is always legible
    if (game.mode !== 2) drawStandings(H / 2 + 92);
    pill(W / 2, H / 2 + 150, game.mode === 2 ? 'next round incoming…' : `first to ${game.target} wins the match`);
  }

  // custom crosshair replaces the OS cursor during the action
  const inAction = (game.state === 'playing' || game.state === 'countdown') && !game.paused;
  if (inAction) drawReticle();
  canvas.style.cursor = inAction ? 'none' : 'default';

  if (game.paused) drawPause();

  ctx.restore();
}

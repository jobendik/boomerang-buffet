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
  const slot = game.controlSchemes.slice(0, game.numHumans).indexOf(0);
  if (slot < 0) return; // nobody is on the mouse
  const me = game.players[slot];
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
  // shake (toned right down under Reduced Effects)
  ctx.save();
  const shake = game.shake * (game.reduceFx ? 0.25 : 1);
  if (shake > 0.2 && !game.paused) ctx.translate(rand(-1, 1) * shake, rand(-1, 1) * shake);

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

  // the world, through the presentation camera: a directional kick on heavy
  // blows and a push-in on the finishing one (the HUD stays put above it)
  const cam = game.cam;
  ctx.save();
  if (!game.paused) ctx.translate(cam.kx, cam.ky);
  if (cam.zoom > 1.002) {
    ctx.translate(cam.focusX, cam.focusY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.focusX, -cam.focusY);
  }
  drawWorld();
  ctx.restore();
  // blink of blast light over the field (HUD stays crisp above it)
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,240,214,${(game.flash / 0.14) * (game.reduceFx ? 0.08 : 0.26)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // the finishing beat gets cinema bars
  const bars = clamp((cam.zoom - 1) / 0.2, 0, 1);
  if (bars > 0.01) {
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, W, 34 * bars);
    ctx.fillRect(0, H - 34 * bars, W, 34 * bars);
  }
  ctx.save();
  ctx.globalAlpha = 1 - bars * 0.85;
  drawHUD();
  ctx.restore();

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

  // "SHOWDOWN!" — a quick banner slam when the brawl is down to two
  if (game.state === 'playing' && game.showdownT > 0) {
    const k = 1 - game.showdownT / 1.8;
    const inK = clamp(k / 0.12, 0, 1);
    const outK = clamp((1 - k) / 0.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(inK, outK);
    ctx.translate(W / 2 + (1 - inK) * -160, 118);
    ctx.rotate(-0.04);
    ctx.fillStyle = 'rgba(13,8,22,.8)';
    ctx.fillRect(-W, -24, W * 2, 46);
    ctx.fillStyle = UI.red;
    ctx.fillRect(-W, -27, W * 2, 3);
    ctx.fillRect(-W, 22, W * 2, 3);
    ctx.font = fontD(34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = UI.ink;
    ctx.strokeText('SHOWDOWN!', 0, 1);
    ctx.fillStyle = UI.gold;
    ctx.fillText('SHOWDOWN!', 0, 1);
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
      const rw = game.roundWinner;
      const who = rw.isAI ? rw.char.name.toUpperCase() : game.numHumans <= 1 ? 'YOU' : `P${game.players.indexOf(rw) + 1}`;
      const team = game.mode === 1 ? (rw.team === 0 ? 'BLUE TEAM' : 'PINK TEAM') : null;
      drawCenterText(team ? `${team} SCORES!` : who + (who === 'YOU' ? ' SCORE!' : ' SCORES!'), null, rw.char.body);
    } else {
      // nobody survived their own victory lap
      drawCenterText('DOUBLE KO!', 'nobody scores', UI.dim);
    }
    // current standings, so the race to the target is always legible
    if (game.mode !== 2) drawStandings(H / 2 + 92);
    pill(W / 2, H / 2 + 150, game.mode === 2 ? 'next round incoming…' : `first to ${game.target} wins the match`);
  }

  // custom crosshair replaces the OS cursor during the action
  const inAction = (game.state === 'playing' || game.state === 'countdown') && !game.paused;
  if (inAction) {
    // the reticle lives in world space, so follow the camera to stay under the pointer
    drawReticle();
  }
  canvas.style.cursor = inAction ? 'none' : 'default';

  if (game.paused) drawPause();

  ctx.restore();
}

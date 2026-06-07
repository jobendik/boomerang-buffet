import { ctx } from '../core/canvas';
import { W, H } from '../constants';
import { clamp, TAU } from '../core/math';
import { audio } from '../core/audio';
import { mouse } from '../core/input';
import { CHARS } from '../data/characters';
import { ARENAS } from '../data/arena';
import { roundRectPath } from '../gfx/shapes';

const MODE_NAMES = ['Free-for-All', 'Team Up', 'Golden Boom', 'Hide & Seek'];
import { game } from '../game/state';
import { startMatch } from '../game/flow';
import { computeAwards } from '../game/awards';
import { drawArena } from './arena';
import { drawWorld } from './world';

/** Title screen, option counters and the match-over screen. */

interface MenuButton {
  x: number;
  y: number;
  w: number;
  h: number;
  act: string;
}

const menuButtons: MenuButton[] = [];

function pointIn(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function drawSmallBtn(x: number, y: number, s: number, sym: string, act: string): void {
  const hov = pointIn(mouse.x, mouse.y, x, y, s, s);
  ctx.fillStyle = hov ? '#ffce54' : 'rgba(255,255,255,.16)';
  roundRectPath(x, y, s, s, 8);
  ctx.fill();
  ctx.fillStyle = hov ? '#1a1226' : '#fff3df';
  ctx.font = '900 20px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sym, x + s / 2, y + s / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  menuButtons.push({ x, y, w: s, h: s, act });
}

function drawCounter(
  cx: number,
  cy: number,
  value: number,
  leftSym: string,
  rightSym: string,
  tag: string,
  label?: string
): void {
  const bs = 30;
  const w = 130;
  // minus
  drawSmallBtn(cx - w / 2, cy - bs / 2, bs, leftSym, tag + '-');
  drawSmallBtn(cx + w / 2 - bs, cy - bs / 2, bs, rightSym, tag + '+');
  ctx.fillStyle = '#fff3df';
  ctx.font = '900 26px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label !== undefined ? label : String(value), cx, cy);
  ctx.textBaseline = 'alphabetic';
}

export function drawMenu(): void {
  drawArena();
  // big title
  ctx.textAlign = 'center';
  const t = game.time;
  ctx.save();
  ctx.translate(W / 2, 150 + Math.sin(t * 1.5) * 6);
  ctx.font = '900 78px "Trebuchet MS",sans-serif';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1a1226';
  ctx.strokeText('BOOMERANG', 0, 0);
  ctx.fillStyle = '#ffce54';
  ctx.fillText('BOOMERANG', 0, 0);
  ctx.font = '900 60px "Trebuchet MS",sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeText('BUFFET', 0, 64);
  ctx.fillStyle = '#ff5d6c';
  ctx.fillText('BUFFET', 0, 64);
  ctx.restore();

  // decorative spinning boomerangs + a couple food faces
  for (let i = 0; i < 6; i++) {
    const a = t * 0.6 + (i * TAU) / 6;
    const rx = W / 2 + Math.cos(a) * 360;
    const ry = 150 + Math.sin(a) * 90;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(0.9, 0.9);
    CHARS[i].draw(CHARS[i], 20, [Math.cos(a + 1), Math.sin(a + 1)]);
    ctx.restore();
  }

  menuButtons.length = 0;

  // players selector
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillStyle = '#fff3df';
  ctx.textAlign = 'center';
  ctx.fillText('FIGHTERS', W / 2, 318);
  drawCounter(W / 2, 348, game.numPlayers, '−', '+', 'players');
  ctx.fillStyle = '#caa9dd';
  ctx.font = '700 16px "Trebuchet MS"';
  ctx.fillText('You + ' + (game.numPlayers - 1) + ' CPU', W / 2, 388);

  // difficulty
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillStyle = '#fff3df';
  ctx.fillText('CPU SKILL', W / 2 - 230, 318);
  const diffNames = ['Chill', 'Normal', 'Spicy'];
  drawCounter(W / 2 - 230, 348, game.difficulty + 1, '<', '>', 'diff', diffNames[game.difficulty]);

  // target
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillStyle = '#fff3df';
  ctx.fillText('WIN SCORE', W / 2 + 230, 318);
  drawCounter(W / 2 + 230, 348, game.target, '−', '+', 'target');

  // second row: mode + arena + fall safety
  ctx.font = '700 22px "Trebuchet MS"';
  ctx.fillStyle = '#fff3df';
  ctx.fillText('MODE', W / 2 - 230, 402);
  drawCounter(W / 2 - 230, 432, game.mode, '<', '>', 'mode', MODE_NAMES[game.mode]);
  ctx.fillStyle = '#fff3df';
  ctx.fillText('ARENA', W / 2, 402);
  const arenaName = game.arenaSel < 0 ? 'Random' : ARENAS[game.arenaSel].name;
  drawCounter(W / 2, 432, game.arenaSel, '<', '>', 'arena', arenaName);
  ctx.fillStyle = '#fff3df';
  ctx.fillText('FALL SAFETY', W / 2 + 230, 402);
  const fallNames = ['Off', 'Gentle', 'Extreme'];
  drawCounter(W / 2 + 230, 432, game.fallProtect, '<', '>', 'fall', fallNames[game.fallProtect]);

  // play button
  const bw = 280;
  const bh = 60;
  const bx = W / 2 - bw / 2;
  const by = 474;
  const hov = pointIn(mouse.x, mouse.y, bx, by, bw, bh);
  ctx.save();
  ctx.translate(W / 2, by + bh / 2 + (hov ? Math.sin(t * 8) * 2 : 0));
  ctx.fillStyle = '#1a1226';
  roundRectPath(-bw / 2 + 4, -bh / 2 + 6, bw, bh, 18);
  ctx.fill();
  ctx.fillStyle = hov ? '#ffe08a' : '#7ad06d';
  roundRectPath(-bw / 2, -bh / 2, bw, bh, 18);
  ctx.fill();
  ctx.fillStyle = '#1a1226';
  ctx.font = '900 32px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLAY  ▶', 0, 2);
  ctx.restore();
  menuButtons.push({ x: bx, y: by, w: bw, h: bh, act: 'play' });

  // controls strip
  ctx.fillStyle = 'rgba(255,243,223,.75)';
  ctx.font = '600 15px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    'WASD move  ·  Mouse aim  ·  Hold Left-Click to charge & curve throw  ·  Space dash  ·  Right-Click / E slash',
    W / 2,
    544
  );
  ctx.fillText(
    'Slash clashes boomerangs & slices foes · dash beats out flames and leaps pits · grab stacking power-ups to combine effects.',
    W / 2,
    568
  );
}

export function handleMenuClick(): void {
  for (const b of menuButtons) {
    if (pointIn(mouse.x, mouse.y, b.x, b.y, b.w, b.h)) {
      audio.tick();
      switch (b.act) {
        case 'play':
          startMatch();
          break;
        case 'players-':
          game.numPlayers = clamp(game.numPlayers - 1, 2, 6);
          break;
        case 'players+':
          game.numPlayers = clamp(game.numPlayers + 1, 2, 6);
          break;
        case 'diff-':
          game.difficulty = clamp(game.difficulty - 1, 0, 2);
          break;
        case 'diff+':
          game.difficulty = clamp(game.difficulty + 1, 0, 2);
          break;
        case 'target-':
          game.target = clamp(game.target - 1, 1, 9);
          break;
        case 'target+':
          game.target = clamp(game.target + 1, 1, 9);
          break;
        case 'mode-':
          game.mode = clamp(game.mode - 1, 0, MODE_NAMES.length - 1);
          break;
        case 'mode+':
          game.mode = clamp(game.mode + 1, 0, MODE_NAMES.length - 1);
          break;
        case 'arena-':
          game.arenaSel = clamp(game.arenaSel - 1, -1, ARENAS.length - 1);
          break;
        case 'arena+':
          game.arenaSel = clamp(game.arenaSel + 1, -1, ARENAS.length - 1);
          break;
        case 'fall-':
          game.fallProtect = clamp(game.fallProtect - 1, 0, 2);
          break;
        case 'fall+':
          game.fallProtect = clamp(game.fallProtect + 1, 0, 2);
          break;
      }
      return;
    }
  }
}

export function drawMatchOver(): void {
  drawWorld();
  ctx.fillStyle = 'rgba(20,12,28,.78)';
  ctx.fillRect(0, 0, W, H);
  const w = game.matchWinner;
  if (!w) return;

  // winner trophy
  ctx.save();
  ctx.translate(W / 2, 130 + Math.sin(game.time * 2) * 8);
  ctx.scale(2.0, 2.0);
  w.char.draw(w.char, 18, [Math.cos(game.time * 2), 0.2]);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '900 56px "Trebuchet MS",sans-serif';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#1a1226';
  let title: string;
  if (game.mode === 1) {
    // Team Up — celebrate the squad, and call out the human's team specially
    title = w.team === 0 ? 'YOUR TEAM WINS!' : 'TEAM ' + (w.team + 1) + ' WINS!';
  } else {
    title = w.isAI ? 'CPU ' + w.char.name + ' WINS!' : 'YOU WIN!';
  }
  ctx.strokeText(title, W / 2, 250);
  ctx.fillStyle = '#ffce54';
  ctx.fillText(title, W / 2, 250);

  // telemetry awards
  const awards = computeAwards();
  ctx.font = '700 16px "Trebuchet MS"';
  ctx.fillStyle = 'rgba(255,243,223,.65)';
  ctx.fillText('— MATCH AWARDS —', W / 2, 300);
  let ay = 332;
  for (const aw of awards) {
    ctx.save();
    ctx.translate(W / 2 - 150, ay - 6);
    ctx.scale(0.7, 0.7);
    aw.player.char.draw(aw.player.char, 17, [0, 0]);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = '900 17px "Trebuchet MS"';
    ctx.fillStyle = aw.player.char.body;
    ctx.fillText(aw.title, W / 2 - 128, ay - 2);
    ctx.font = '600 14px "Trebuchet MS"';
    ctx.fillStyle = 'rgba(255,243,223,.7)';
    ctx.fillText((aw.player.isAI ? 'CPU ' + aw.player.char.name : 'You') + ' · ' + aw.detail, W / 2 - 128, ay + 16);
    ay += 44;
  }

  ctx.textAlign = 'center';
  ctx.font = '700 18px "Trebuchet MS"';
  ctx.fillStyle = '#fff3df';
  ctx.fillText('click to play again', W / 2, H - 36);

  // replay area = whole screen
  menuButtons.length = 0;
  menuButtons.push({ x: 0, y: 0, w: W, h: H, act: 'menu' });
}

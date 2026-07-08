import { canvas, ctx } from '../core/canvas';
import { W, H } from '../constants';
import { clamp, TAU } from '../core/math';
import { audio } from '../core/audio';
import { mouse } from '../core/input';
import { CHARS } from '../data/characters';
import { ARENAS } from '../data/arena';
import { POWERS, POWER_KEYS, type PowerKey } from '../data/powers';
import { drawBoomShape, roundRectPath } from '../gfx/shapes';
import { drawCrown, drawPowerIcon } from '../gfx/icons';
import { button, fontB, fontD, keycap, panel, pill, titleText, UI } from './widgets';
import { game, saveSettings, sanitizeCharSel, sanitizeControlSchemes } from '../game/state';
import { startMatch } from '../game/flow';
import { computeAwards } from '../game/awards';
import { drawArena } from './arena';
import { drawWorld } from './world';
import type { Arena } from '../types';

/** Menu system: title / match setup / how-to-play, pause overlay and the
 *  match-over podium. All canvas-drawn; hit areas are rebuilt every frame. */

const MODE_NAMES = ['Free-for-All', 'Team Up', 'Golden', 'Hide & Seek'];
const MODE_DESC = [
  'Every snack for itself — last one standing takes the round.',
  'Two squads, friendly fire off. Outlive the other team together.',
  'Hold the golden boomerang for 14 total seconds to win the match.',
  'You seek; the others hide as props. Clear them out before time runs out.',
];
const DIFF_NAMES = ['Chill', 'Normal', 'Spicy'];
const FALL_NAMES = ['Off', 'Gentle', 'Extreme'];
/** Control-scheme picker labels, matching `game.controlSchemes` indices. */
const SCHEME_NAMES = ['Mouse + Arrows', 'WASD keys', 'IJKL keys', 'Gamepad 1', 'Gamepad 2', 'Gamepad 3', 'Gamepad 4'];

/** Which human slot's fighter/controls the left setup panel is currently editing. */
let charTab = 0;

/** Assign `scheme` to human slot `tab`, swapping with whoever else already
 *  has it so every active slot keeps a distinct input device. Only called
 *  with `scheme` one step away from the current value (see the stepper
 *  click handler), so a single modulo is enough to wrap it into range. */
function setControlScheme(tab: number, scheme: number): void {
  const n = SCHEME_NAMES.length;
  const wrapped = ((scheme % n) + n) % n;
  const clash = game.controlSchemes.findIndex((s, i) => i < game.numHumans && i !== tab && s === wrapped);
  if (clash >= 0) game.controlSchemes[clash] = game.controlSchemes[tab];
  game.controlSchemes[tab] = wrapped;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  act: string;
}

const hits: Hit[] = [];
let hoverAny = false;

function pointIn(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function hot(x: number, y: number, w: number, h: number): boolean {
  const hov = pointIn(mouse.x, mouse.y, x, y, w, h);
  if (hov) hoverAny = true;
  return hov;
}

/** Draw a button AND register its hit area. */
function btn(x: number, y: number, w: number, h: number, label: string, act: string, opts: { primary?: boolean; danger?: boolean; px?: number } = {}): void {
  button(x, y, w, h, label, { ...opts, hover: hot(x, y, w, h) });
  hits.push({ x, y, w, h, act });
}

function beginScreen(): void {
  hits.length = 0;
  hoverAny = false;
}

function endScreen(): void {
  canvas.style.cursor = hoverAny ? 'pointer' : 'default';
}

/* ================================ TITLE =================================== */

function drawTitle(): void {
  const t = game.time;

  // a parade of the cast marching along the bottom of the arena
  const stride = (W + 140) / CHARS.length;
  for (let i = 0; i < CHARS.length; i++) {
    const x = ((t * 46 + i * stride) % (W + 140)) - 70;
    const y = 560 + Math.sin(t * 9 + i * 1.7) * 2.5;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 17, 15, 6, 0, 0, TAU);
    ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 9 + i * 1.7) * 0.06);
    CHARS[i].draw(CHARS[i], 17, [1, 0.15]);
    ctx.restore();
  }

  // logo: a slow-spinning boomerang halo behind two stacked wordmarks
  const ly = 150 + Math.sin(t * 1.4) * 5;
  ctx.save();
  ctx.globalAlpha = 0.16;
  drawBoomShape(W / 2, ly - 16, 120, t * 0.7, '#ffce54');
  ctx.globalAlpha = 1;
  // BOOMERANG — per-letter bounce
  ctx.font = fontD(86);
  ctx.textBaseline = 'alphabetic';
  const word = 'BOOMERANG';
  const widths = word.split('').map((ch) => ctx.measureText(ch).width);
  const tracking = 2;
  const total = widths.reduce((a, b) => a + b + tracking, -tracking);
  let lx = W / 2 - total / 2;
  const grad = ctx.createLinearGradient(0, ly - 70, 0, ly + 6);
  grad.addColorStop(0, '#ffe28a');
  grad.addColorStop(1, '#ffb83a');
  for (let i = 0; i < word.length; i++) {
    const dy = Math.sin(t * 2.2 + i * 0.6) * 4;
    ctx.save();
    ctx.translate(lx + widths[i] / 2, ly + dy);
    ctx.rotate(Math.sin(t * 2.2 + i * 0.6) * 0.03);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 13;
    ctx.strokeStyle = UI.ink;
    ctx.strokeText(word[i], 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText(word[i], 0, 0);
    ctx.restore();
    lx += widths[i] + tracking;
  }
  // BUFFET — on a tilted ribbon
  ctx.save();
  ctx.translate(W / 2, ly + 56);
  ctx.rotate(-0.025);
  ctx.fillStyle = UI.ink;
  roundRectPath(-152, -34, 304, 56, 14);
  ctx.fill();
  ctx.fillStyle = '#ff5d6c';
  roundRectPath(-146, -30, 292, 48, 11);
  ctx.fill();
  const sheen = ctx.createLinearGradient(0, -30, 0, 18);
  sheen.addColorStop(0, 'rgba(255,255,255,.28)');
  sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRectPath(-146, -30, 292, 48, 11);
  ctx.fill();
  ctx.font = fontD(40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = UI.cream;
  ctx.fillText('BUFFET', 0, -4);
  ctx.restore();
  ctx.restore();

  pill(W / 2, ly + 102, 'A SNACK-SIZED ARENA BRAWLER — SLICE, DASH & PARRY', 13);

  // main buttons
  btn(W / 2 - 150, 372, 300, 64, 'PLAY', 'play', { primary: true, px: 30 });
  btn(W / 2 - 122, 452, 244, 46, 'HOW TO PLAY', 'help', { px: 20 });

  // sound toggle (top-right)
  const mx = W - 64;
  const my = 18;
  const hov = hot(mx, my, 44, 38);
  ctx.fillStyle = hov ? 'rgba(255,255,255,.22)' : 'rgba(13,8,22,.6)';
  roundRectPath(mx, my, 44, 38, 10);
  ctx.fill();
  drawSpeaker(mx + 22, my + 19, audio.muted);
  hits.push({ x: mx, y: my, w: 44, h: 38, act: 'mute' });

  ctx.fillStyle = 'rgba(255,243,223,.4)';
  ctx.font = fontB(11, 700);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('best with mouse + keyboard', W - 16, H - 12);
}

function drawSpeaker(x: number, y: number, muted: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = UI.cream;
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(-4, -4);
  ctx.lineTo(3, -10);
  ctx.lineTo(3, 10);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-9, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = UI.cream;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (muted) {
    ctx.strokeStyle = UI.red;
    ctx.beginPath();
    ctx.moveTo(6, -7);
    ctx.lineTo(13, 7);
    ctx.moveTo(13, -7);
    ctx.lineTo(6, 7);
    ctx.stroke();
  } else {
    for (const r of [6, 10]) {
      ctx.beginPath();
      ctx.arc(4, 0, r, -0.85, 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ================================ SETUP =================================== */

/** Mini top-down preview of an arena's layout. */
function drawArenaPreview(A: Arena | null, x: number, y: number, w: number, h: number): void {
  ctx.save();
  roundRectPath(x, y, w, h, 8);
  ctx.clip();
  if (!A) {
    ctx.fillStyle = '#241a33';
    ctx.fillRect(x, y, w, h);
    ctx.font = fontD(34);
    ctx.fillStyle = 'rgba(255,243,223,.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2);
    ctx.restore();
    return;
  }
  const kx = w / W;
  const ky = h / H;
  ctx.fillStyle = A.floorA;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  for (const P of A.pits) ctx.fillRect(x + P.x * kx, y + P.y * ky, P.w * kx, P.h * ky);
  ctx.fillStyle = 'rgba(110,170,80,.75)';
  for (const B of A.bushes) {
    ctx.beginPath();
    ctx.ellipse(x + (B.x + B.w / 2) * kx, y + (B.y + B.h / 2) * ky, (B.w / 2) * kx, (B.h / 2) * ky, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  for (const R of A.obstacles) ctx.fillRect(x + R.x * kx, y + R.y * ky, R.w * kx, R.h * ky);
  ctx.fillStyle = 'rgba(255,170,60,.8)';
  for (const C of A.crushers) ctx.fillRect(x + C.x * kx, y + C.y * ky, C.w * kx, C.h * ky);
  A.gates.forEach((G, gi) => {
    ctx.fillStyle = gi === 0 ? '#ffd23a' : '#7ad0ff';
    ctx.fillRect(x + G.x * kx, y + G.y * ky, Math.max(2, G.w * kx), Math.max(2, G.h * ky));
  });
  A.switches.forEach((S) => {
    ctx.fillStyle = S.gate === 0 ? '#ffd23a' : '#7ad0ff';
    ctx.beginPath();
    ctx.arc(x + S.x * kx, y + S.y * ky, 2.4, 0, TAU);
    ctx.fill();
  });
  for (const P of A.portals) {
    ctx.strokeStyle = '#8affd6';
    ctx.lineWidth = 1.5;
    for (const [px, py] of [[P.ax, P.ay], [P.bx, P.by]] as const) {
      ctx.beginPath();
      ctx.arc(x + px * kx, y + py * ky, 3.2, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = A.accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

/** A row of small mutually-exclusive option buttons. */
function segmented(x: number, y: number, w: number, h: number, options: string[], active: number, act: string): void {
  const gap = 6;
  const bw = (w - gap * (options.length - 1)) / options.length;
  options.forEach((label, i) => {
    const bx = x + i * (bw + gap);
    const on = i === active;
    const hov = hot(bx, y, bw, h);
    ctx.fillStyle = on ? UI.gold : hov ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.1)';
    roundRectPath(bx, y, bw, h, 9);
    ctx.fill();
    if (on) {
      ctx.strokeStyle = 'rgba(20,12,32,.5)';
      ctx.lineWidth = 1.5;
      roundRectPath(bx, y, bw, h, 9);
      ctx.stroke();
    }
    ctx.fillStyle = on ? UI.ink : UI.cream;
    ctx.font = fontB(13, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, y + h / 2 + 0.5);
    hits.push({ x: bx, y, w: bw, h, act: `${act}:${i}` });
  });
}

/** Label + − value + stepper. */
function stepper(x: number, y: number, w: number, label: string, value: string, act: string): void {
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(12, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 14);
  const bs = 26;
  for (const [sym, suffix, bx] of [['−', '-', x + w - bs * 2 - 64], ['+', '+', x + w - bs]] as const) {
    const hov = hot(bx, y, bs, bs + 2);
    ctx.fillStyle = hov ? UI.gold : 'rgba(255,255,255,.14)';
    roundRectPath(bx, y, bs, bs + 2, 8);
    ctx.fill();
    ctx.fillStyle = hov ? UI.ink : UI.cream;
    ctx.font = fontD(17);
    ctx.textAlign = 'center';
    ctx.fillText(sym, bx + bs / 2, y + bs / 2 + 2);
    hits.push({ x: bx, y, w: bs, h: bs + 2, act: act + suffix });
  }
  ctx.fillStyle = UI.cream;
  ctx.font = fontD(17);
  ctx.textAlign = 'center';
  ctx.fillText(value, x + w - bs - 32, y + 15);
}

function drawSetup(): void {
  // sanitize persisted selections against the live data tables
  game.arenaSel = clamp(game.arenaSel, -1, ARENAS.length - 1);
  sanitizeCharSel(CHARS.length - 1);
  sanitizeControlSchemes();
  if (charTab >= game.numHumans) charTab = game.numHumans - 1;
  if (charTab < 0) charTab = 0;

  ctx.fillStyle = 'rgba(10,6,18,.72)';
  ctx.fillRect(0, 0, W, H);
  titleText('MATCH SETUP', W / 2, 58, 38);

  /* ---- left: fighter select ---- */
  panel(36, 84, 404, 466);
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(game.numHumans > 1 ? `P${charTab + 1} FIGHTER` : 'YOUR FIGHTER', 56, 112);

  // player tabs — pick which human's avatar/controls this panel is editing
  if (game.numHumans > 1) {
    const tabW = 44;
    const tabH = 20;
    const tabGap = 6;
    const tabsRight = 36 + 404 - 20;
    const tabsX = tabsRight - (tabW * game.numHumans + tabGap * (game.numHumans - 1));
    const tabsY = 96;
    for (let i = 0; i < game.numHumans; i++) {
      const tx = tabsX + i * (tabW + tabGap);
      const active = i === charTab;
      const hov = hot(tx, tabsY, tabW, tabH);
      ctx.fillStyle = active ? UI.gold : hov ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.1)';
      roundRectPath(tx, tabsY, tabW, tabH, 8);
      ctx.fill();
      ctx.fillStyle = active ? UI.ink : UI.cream;
      ctx.font = fontB(11, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P${i + 1}`, tx + tabW / 2, tabsY + tabH / 2 + 1);
      hits.push({ x: tx, y: tabsY, w: tabW, h: tabH, act: 'chartab:' + i });
    }
    ctx.textBaseline = 'alphabetic';
  }

  const tw = 88;
  const th = 84;
  const gx = 36 + 18;
  const gy = 124;
  const otherPicks = game.charSel.slice(0, game.numHumans).filter((_, i) => i !== charTab);
  for (let i = -1; i < CHARS.length; i++) {
    const slot = i + 1;
    const col = slot % 4;
    const row = Math.floor(slot / 4);
    const x = gx + col * (tw + 6);
    const y = gy + row * (th + 6);
    const sel = game.charSel[charTab] === i;
    const takenByOther = i >= 0 && otherPicks.includes(i);
    const hov = hot(x, y, tw, th);
    ctx.fillStyle = sel ? 'rgba(255,206,84,.18)' : hov ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)';
    roundRectPath(x, y, tw, th, 12);
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = UI.gold;
      ctx.lineWidth = 2.5;
      roundRectPath(x + 1, y + 1, tw - 2, th - 2, 11);
      ctx.stroke();
    }
    ctx.save();
    if (takenByOther) ctx.globalAlpha = 0.35;
    if (i === -1) {
      // RANDOM tile: a die face
      ctx.save();
      ctx.translate(x + tw / 2, y + th / 2 - 6);
      ctx.rotate(0.2);
      ctx.fillStyle = '#fff3df';
      roundRectPath(-15, -15, 30, 30, 7);
      ctx.fill();
      ctx.fillStyle = UI.ink;
      for (const [dx, dy] of [[-7, -7], [7, 7], [0, 0], [-7, 7], [7, -7]] as const) {
        ctx.beginPath();
        ctx.arc(dx, dy, 2.6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x + tw / 2, y + th / 2 - 6);
      const c = CHARS[i];
      const looking = hov || sel;
      c.draw(c, 19, looking ? [0, 0.3] : [Math.sin(game.time + i), 0.1]);
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = sel ? UI.gold : 'rgba(255,243,223,.7)';
    ctx.font = fontB(11, 800);
    ctx.textAlign = 'center';
    ctx.fillText(i === -1 ? 'Random' : CHARS[i].name, x + tw / 2, y + th - 8);
    hits.push({ x, y, w: tw, h: th, act: 'char:' + i });
  }

  // control-device picker for the tabbed player — freely assignable so any
  // mix of keyboard schemes and gamepads can be used together
  const ctrlY = gy + 4 * (th + 6) + 10;
  stepper(56, ctrlY, 384, 'CONTROLS', SCHEME_NAMES[game.controlSchemes[charTab]], 'scheme' + charTab);

  /* ---- right: match options ---- */
  panel(456, 84, 532, 466);
  const rx = 456 + 20;
  const rw = 532 - 40;
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.textAlign = 'left';
  ctx.fillText('MODE', rx, 112);
  segmented(rx, 122, rw, 32, MODE_NAMES, game.mode, 'mode');
  ctx.fillStyle = 'rgba(255,243,223,.6)';
  ctx.font = fontB(12, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(MODE_DESC[game.mode], rx, 174);

  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.fillText('ARENA', rx, 204);
  segmented(rx, 214, rw, 32, ['Random', ...ARENAS.map((a) => a.name)], game.arenaSel + 1, 'arena');
  ctx.fillStyle = 'rgba(255,243,223,.6)';
  ctx.font = fontB(12, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(game.arenaSel < 0 ? 'A different arena every round.' : ARENAS[game.arenaSel].tagline, rx, 266);

  // minimap + numeric settings side by side
  drawArenaPreview(game.arenaSel < 0 ? null : ARENAS[game.arenaSel], rx, 282, 200, 125);
  const sx = rx + 224;
  const sw = rw - 224;
  stepper(sx, 282, sw, 'FIGHTERS', `${game.numPlayers}`, 'players');
  ctx.fillStyle = 'rgba(255,243,223,.45)';
  ctx.font = fontB(10, 700);
  ctx.textAlign = 'left';
  ctx.fillText(`${game.numHumans} human + ${game.numPlayers - game.numHumans} cpu`, sx, 316);
  stepper(sx, 330, sw, 'WIN SCORE', `${game.target}`, 'target');
  stepper(sx, 364, sw, 'LOCAL PLAYERS', `${game.numHumans}`, 'humans');
  ctx.fillStyle = 'rgba(255,243,223,.45)';
  ctx.font = fontB(10, 700);
  ctx.textAlign = 'left';
  ctx.fillText(`each with its own device — pick under FIGHTER (left)`, sx, 398);

  ctx.fillStyle = UI.dim;
  ctx.font = fontB(12, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CPU SKILL', sx, 424);
  segmented(sx, 434, sw, 26, DIFF_NAMES, game.difficulty, 'diff');

  ctx.fillStyle = UI.dim;
  ctx.font = fontB(12, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PIT SAFETY', rx, 470);
  segmented(rx, 480, 240, 26, FALL_NAMES, game.fallProtect, 'fall');
  ctx.fillStyle = 'rgba(255,243,223,.45)';
  ctx.font = fontB(11, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(['pits are lethal', 'pit edges nudge you back', 'pits become solid walls'][game.fallProtect], rx, 528);

  // Hide & Seek plays best with a full lobby — gentle hint
  if (game.mode === 3 && game.numPlayers < 4) {
    ctx.fillStyle = 'rgba(255,206,84,.75)';
    ctx.font = fontB(12, 700);
    ctx.fillText('tip: Hide & Seek shines with 4+ fighters', rx, 543);
  }

  btn(40, 572, 140, 52, 'BACK', 'back', { px: 20 });
  btn(W / 2 - 10, 568, 360, 58, 'START MATCH', 'start', { primary: true, px: 26 });
}

/* ================================ HELP ==================================== */

let helpTip: { key: PowerKey; x: number; y: number } | null = null;

function drawHelp(): void {
  ctx.fillStyle = 'rgba(10,6,18,.72)';
  ctx.fillRect(0, 0, W, H);
  titleText('HOW TO PLAY', W / 2, 58, 38);
  helpTip = null;

  /* controls */
  panel(36, 84, 330, 332);
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CONTROLS', 56, 112);
  const controls: [string, string][] = [
    ['WASD', 'Move'],
    ['MOUSE', 'Aim'],
    ['LMB', 'Throw · charge & strafe to bank'],
    ['RMB / E', 'Slash foes & parry boomerangs'],
    ['SPACE', 'Dash'],
    ['SHIFT / F', 'Hop over danger'],
    ['ESC', 'Pause'],
    ['M', 'Mute'],
  ];
  controls.forEach(([k, label], i) => {
    const y = 126 + i * 30;
    keycap(56, y, k, 22);
    ctx.fillStyle = UI.cream;
    ctx.font = fontB(13, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 148, y + 11);
  });

  // Up to 4 local players; each picks their own device in Setup → FIGHTER
  // (mouse+arrows, WASD, IJKL, or any connected gamepad, in any combination).
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(11, 900);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('LOCAL MULTIPLAYER (SETUP → FIGHTER, per player)', 56, 372);
  const localPlayers: [string, string][] = [
    ['WASD', 'move · V throw · X slash · C dash · Z jump'],
    ['IJKL', 'move · , throw · O slash · U dash · N jump'],
    ['Gamepad', 'e.g. PS5 controller — sticks move/aim, face buttons act'],
  ];
  localPlayers.forEach(([k, label], i) => {
    const y = 384 + i * 15;
    ctx.fillStyle = UI.gold;
    ctx.font = fontB(10.5, 800);
    ctx.fillText(k, 56, y);
    ctx.fillStyle = 'rgba(255,243,223,.7)';
    ctx.font = fontB(10.5, 700);
    ctx.fillText(label, 150, y);
  });

  /* rules */
  panel(382, 84, 606, 332);
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('THE RULES OF THE BUFFET', 402, 112);
  const rules = [
    ['One hit, one kill.', 'Boomerangs bounce off walls and come back to your hand.'],
    ['Throwing leaves you unarmed.', 'No slashing until it returns — dash to survive. Up close, slash beats throw.'],
    ['Parry!', 'Slash an incoming boomerang at the last moment to knock it straight back.'],
    ['Dash is your escape.', 'It stomps out flames, leaps over pits, and dodges anything.'],
    ['Frozen solid?', 'Mash dash to shatter free — one bump and you break.'],
    ['Work the arena.', 'Hide in bushes, stand on plates to open matching gates, mind the pistons.'],
  ];
  rules.forEach(([head, body], i) => {
    const y = 138 + i * 46;
    ctx.fillStyle = UI.gold;
    ctx.font = fontB(14, 900);
    ctx.fillText(head, 402, y);
    ctx.fillStyle = 'rgba(255,243,223,.75)';
    ctx.font = fontB(12.5, 700);
    ctx.fillText(body, 402, y + 17);
  });

  /* power glossary */
  panel(36, 432, 952, 128);
  ctx.fillStyle = UI.dim;
  ctx.font = fontB(13, 900);
  ctx.fillText('POWER BOOKS — GRAB THEM, STACK THEM, COMBINE THEM', 56, 458);
  const cols = 11;
  const cw = 912 / cols;
  for (let i = 0; i < POWER_KEYS.length; i++) {
    const key = POWER_KEYS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 56 + col * cw;
    const y = 468 + row * 44;
    const hov = hot(x - 4, y - 2, cw - 6, 42);
    if (hov) {
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      roundRectPath(x - 4, y - 2, cw - 6, 42, 8);
      ctx.fill();
      helpTip = { key, x: x + cw / 2, y: y - 8 };
    }
    drawPowerIcon(key, x + (cw - 10) / 2, y + 12, 8, POWERS[key].color);
    ctx.fillStyle = hov ? UI.cream : 'rgba(255,243,223,.6)';
    ctx.font = fontB(9.5, 800);
    ctx.textAlign = 'center';
    ctx.fillText(POWERS[key].name, x + (cw - 10) / 2, y + 36);
    ctx.textAlign = 'left';
  }

  btn(40, 572, 140, 52, 'BACK', 'back', { px: 20 });
  pill(W / 2 + 60, 582, 'POWERS PERSIST UNTIL YOU DIE — FIRE & ICE REPLACE EACH OTHER', 12);

  // hover tooltip rides above everything
  if (helpTip) {
    const P = POWERS[helpTip.key];
    ctx.font = fontB(12.5, 700);
    const tw = ctx.measureText(P.desc).width + 24;
    const tx = clamp(helpTip.x - tw / 2, 10, W - tw - 10);
    const ty = helpTip.y - 34;
    ctx.fillStyle = 'rgba(13,8,22,.95)';
    roundRectPath(tx, ty, tw, 28, 8);
    ctx.fill();
    ctx.strokeStyle = P.color;
    ctx.lineWidth = 1.5;
    roundRectPath(tx, ty, tw, 28, 8);
    ctx.stroke();
    ctx.fillStyle = UI.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(P.desc, tx + tw / 2, ty + 14);
  }
}

/* ============================== DISPATCH ================================== */

export function drawMenu(): void {
  beginScreen();
  drawArena();
  if (game.menuPage === 'title') drawTitle();
  else if (game.menuPage === 'setup') drawSetup();
  else drawHelp();
  endScreen();
}

export function handleMenuClick(): void {
  for (const b of hits) {
    if (!pointIn(mouse.x, mouse.y, b.x, b.y, b.w, b.h)) continue;
    audio.tick();
    // per-tab control-scheme stepper hits look like 'scheme0-' / 'scheme0+'
    const schemeMatch = /^scheme(\d)([-+])$/.exec(b.act);
    if (schemeMatch) {
      const tab = parseInt(schemeMatch[1], 10);
      const dir = schemeMatch[2] === '+' ? 1 : -1;
      setControlScheme(tab, game.controlSchemes[tab] + dir);
      saveSettings();
      return;
    }
    const [act, arg] = b.act.split(':');
    switch (act) {
      case 'play':
        game.menuPage = 'setup';
        break;
      case 'help':
        game.menuPage = 'help';
        break;
      case 'back':
        game.menuPage = 'title';
        break;
      case 'start':
        saveSettings();
        startMatch();
        break;
      case 'mute':
        audio.toggleMute();
        break;
      case 'char':
        game.charSel[charTab] = parseInt(arg, 10);
        break;
      case 'chartab':
        charTab = clamp(parseInt(arg, 10), 0, game.numHumans - 1);
        break;
      case 'mode':
        game.mode = clamp(parseInt(arg, 10), 0, MODE_NAMES.length - 1);
        break;
      case 'arena':
        game.arenaSel = clamp(parseInt(arg, 10) - 1, -1, ARENAS.length - 1);
        break;
      case 'diff':
        game.difficulty = clamp(parseInt(arg, 10), 0, 2);
        break;
      case 'fall':
        game.fallProtect = clamp(parseInt(arg, 10), 0, 2);
        break;
      case 'players-':
        game.numPlayers = clamp(game.numPlayers - 1, 2, 6);
        game.numHumans = Math.min(game.numHumans, game.numPlayers, 4);
        break;
      case 'players+':
        game.numPlayers = clamp(game.numPlayers + 1, 2, 6);
        break;
      case 'humans-':
        game.numHumans = clamp(game.numHumans - 1, 1, Math.min(4, game.numPlayers));
        break;
      case 'humans+':
        game.numHumans = clamp(game.numHumans + 1, 1, Math.min(4, game.numPlayers));
        break;
      case 'target-':
        game.target = clamp(game.target - 1, 1, 9);
        break;
      case 'target+':
        game.target = clamp(game.target + 1, 1, 9);
        break;
    }
    saveSettings();
    return;
  }
}

/* ================================ PAUSE =================================== */

export function drawPause(): void {
  beginScreen();
  const t = performance.now() / 1000; // game.time is frozen while paused
  ctx.fillStyle = 'rgba(10,6,18,.72)';
  ctx.fillRect(0, 0, W, H);
  const pw = 380;
  const ph = 348;
  const px = W / 2 - pw / 2;
  const py = H / 2 - ph / 2 - 10;
  panel(px, py, pw, ph);
  ctx.save();
  ctx.translate(W / 2, py + 56);
  ctx.scale(1 + Math.sin(t * 2) * 0.015, 1 + Math.sin(t * 2) * 0.015);
  titleText('PAUSED', 0, 12, 40);
  ctx.restore();

  btn(px + 40, py + 96, pw - 80, 52, 'RESUME', 'resume', { primary: true, px: 22 });
  btn(px + 40, py + 158, pw - 80, 46, 'RESTART MATCH', 'restart', { px: 18 });
  btn(px + 40, py + 214, pw - 80, 46, 'QUIT TO MENU', 'quit', { px: 18 });
  btn(px + 40, py + 270, pw - 80, 46, audio.muted ? 'SOUND: OFF' : 'SOUND: ON', 'sound', { px: 18 });

  ctx.fillStyle = 'rgba(255,243,223,.45)';
  ctx.font = fontB(12, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ESC resumes', W / 2, py + ph - 14);
  endScreen();
}

export function handlePauseClick(): void {
  for (const b of hits) {
    if (!pointIn(mouse.x, mouse.y, b.x, b.y, b.w, b.h)) continue;
    audio.tick();
    switch (b.act) {
      case 'resume':
        game.paused = false;
        break;
      case 'restart':
        game.paused = false;
        startMatch();
        break;
      case 'quit':
        game.paused = false;
        game.state = 'menu';
        game.menuPage = 'title';
        game.matchWinner = null;
        break;
      case 'sound':
        audio.toggleMute();
        break;
    }
    return;
  }
}

/* ============================== MATCH OVER ================================ */

export function drawMatchOver(): void {
  beginScreen();
  drawWorld();
  ctx.fillStyle = 'rgba(14,8,22,.85)';
  ctx.fillRect(0, 0, W, H);
  const w = game.matchWinner;
  if (!w) return;
  const t = game.time;

  let title: string;
  if (game.mode === 1) {
    title = w.team === 0 ? 'YOUR TEAM WINS!' : `TEAM ${w.team + 1} WINS!`;
  } else {
    title = w.isAI ? `${w.char.name.toUpperCase()} WINS!` : 'YOU WIN!';
  }
  titleText(title, W / 2, 92, 54);

  /* podium: 1st centre, 2nd left, 3rd right */
  const ranked = [...game.players].sort((a, b) => {
    const ka = (a === w ? 1e9 : 0) + (game.mode === 2 ? a.goldTime * 100 : a.score * 100) + a.stats.kills;
    const kb = (b === w ? 1e9 : 0) + (game.mode === 2 ? b.goldTime * 100 : b.score * 100) + b.stats.kills;
    return kb - ka;
  });
  const baseY = 320;
  const slots = [
    { p: ranked[0], x: W / 2, h: 86, scale: 1.55, rank: 1 },
    { p: ranked[1], x: W / 2 - 178, h: 56, scale: 1.15, rank: 2 },
    { p: ranked[2], x: W / 2 + 178, h: 38, scale: 1.0, rank: 3 },
  ].filter((s) => s.p);
  for (const s of slots) {
    const pw = 132;
    // pedestal
    ctx.fillStyle = '#241a36';
    roundRectPath(s.x - pw / 2 + 4, baseY - s.h + 5, pw, s.h, 8);
    ctx.fill();
    ctx.fillStyle = s.rank === 1 ? '#4a3a66' : '#3a2d52';
    roundRectPath(s.x - pw / 2, baseY - s.h, pw, s.h, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    roundRectPath(s.x - pw / 2, baseY - s.h, pw, 10, 8);
    ctx.fill();
    ctx.font = fontD(s.rank === 1 ? 30 : 24);
    ctx.fillStyle = s.rank === 1 ? UI.gold : 'rgba(255,243,223,.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.rank), s.x, baseY - s.h / 2 + 2);
    // the fighter, bouncing on their pedestal
    const bounce = s.rank === 1 ? Math.abs(Math.sin(t * 3.2)) * 10 : Math.sin(t * 2 + s.rank) * 2;
    const cy = baseY - s.h - 22 * s.scale - bounce;
    ctx.save();
    ctx.translate(s.x, cy);
    ctx.scale(s.scale, s.scale);
    s.p!.char.draw(s.p!.char, 18, [0, 0.25]);
    ctx.restore();
    if (s.rank === 1) drawCrown(s.x, cy - 30 * s.scale, 16);
    // name + score
    ctx.font = fontB(13, 900);
    ctx.fillStyle = s.p!.isAI ? UI.cream : UI.gold;
    ctx.fillText(s.p!.isAI ? s.p!.char.name : 'You', s.x, baseY + 16);
    ctx.font = fontB(12, 700);
    ctx.fillStyle = 'rgba(255,243,223,.6)';
    ctx.fillText(game.mode === 2 ? `${s.p!.goldTime.toFixed(1)}s held` : `${s.p!.score} rounds · ${s.p!.stats.kills} KOs`, s.x, baseY + 34);
  }

  /* telemetry awards */
  const awards = computeAwards().slice(0, 8);
  if (awards.length) {
    ctx.fillStyle = UI.dim;
    ctx.font = fontB(13, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('— MATCH AWARDS —', W / 2, 392);
    const perRow = Math.min(4, awards.length);
    const cw = 226;
    const chh = 54;
    awards.forEach((aw, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, awards.length - row * perRow);
      const col = i % perRow;
      const x = W / 2 - (inRow * (cw + 10) - 10) / 2 + col * (cw + 10);
      const y = 404 + row * (chh + 10);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      roundRectPath(x, y, cw, chh, 10);
      ctx.fill();
      ctx.save();
      ctx.translate(x + 26, y + chh / 2);
      ctx.scale(0.72, 0.72);
      aw.player.char.draw(aw.player.char, 17, [0.4, 0]);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.font = fontB(13, 900);
      ctx.fillStyle = aw.player.char.body;
      ctx.fillText(aw.title, x + 48, y + 22);
      ctx.font = fontB(11, 700);
      ctx.fillStyle = 'rgba(255,243,223,.65)';
      ctx.fillText((aw.player.isAI ? aw.player.char.name : 'You') + ' · ' + aw.detail, x + 48, y + 39);
    });
  }

  btn(W / 2 - 250, 576, 240, 54, 'REMATCH', 'rematch', { primary: true, px: 22 });
  btn(W / 2 + 14, 576, 240, 54, 'MAIN MENU', 'menu', { px: 22 });

  // confetti spawned during matchover floats over the podium
  for (const p of game.particles) p.draw();
  endScreen();
}

export function handleMatchOverClick(): void {
  for (const b of hits) {
    if (!pointIn(mouse.x, mouse.y, b.x, b.y, b.w, b.h)) continue;
    audio.tick();
    if (b.act === 'rematch') {
      startMatch();
    } else if (b.act === 'menu') {
      game.state = 'menu';
      game.menuPage = 'title';
      game.matchWinner = null;
    }
    return;
  }
}

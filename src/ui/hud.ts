import { ctx } from '../core/canvas';
import { W, H, WALL } from '../constants';
import { clamp, TAU } from '../core/math';
import { POWERS } from '../data/powers';
import { arena } from '../data/arena';
import { drawPowerIcon } from '../gfx/icons';
import { roundRectPath } from '../gfx/shapes';
import { fontB, fontD, keycap, pill, UI } from './widgets';
import { game } from '../game/state';
import type { Player } from '../entities/Player';

/** In-game HUD: scoreboard cards, objective banner, pickup toasts, cooldowns. */

const TEAM_COLORS = ['#5ad1ff', '#ff7ad0'];

/** Label for a local human's card/locator: "YOU" when solo, else "P1"-"P4"
 *  matching their control-scheme slot (see `humanIntents` in game/update.ts). */
function humanLabel(p: Player): string {
  if (game.numHumans <= 1) return 'YOU';
  const slot = game.players.indexOf(p);
  return `P${slot + 1}`;
}

function drawCard(p: Player, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (!p.alive) ctx.globalAlpha = 0.55;

  // card body
  ctx.fillStyle = 'rgba(13,8,22,.78)';
  roundRectPath(0, 0, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = p.alive ? p.char.body : 'rgba(255,255,255,.25)';
  ctx.lineWidth = 2;
  roundRectPath(0, 0, w, h, 12);
  ctx.stroke();
  // the human's card gets a little gold "YOU"/"P#" tab
  if (!p.isAI) {
    const tab = humanLabel(p);
    ctx.fillStyle = UI.gold;
    roundRectPath(10, -5, 34, 10, 5);
    ctx.fill();
    ctx.fillStyle = UI.ink;
    ctx.font = fontB(8, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab, 27, 0.5);
  }
  // Team Up: a coloured stripe down the card's left edge marks the squad
  if (game.mode === 1 && p.team >= 0) {
    ctx.fillStyle = TEAM_COLORS[p.team % TEAM_COLORS.length];
    roundRectPath(3, 8, 4, h - 16, 2);
    ctx.fill();
  }

  // portrait disc + face
  ctx.save();
  ctx.translate(25, h / 2);
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = p.char.body;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(25, h / 2 + 1);
  ctx.scale(0.6, 0.6);
  p.char.draw(p.char, 17, [0, 0]);
  ctx.restore();
  if (!p.alive) {
    ctx.strokeStyle = 'rgba(255,90,90,.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(15, h / 2 - 10);
    ctx.lineTo(35, h / 2 + 10);
    ctx.moveTo(35, h / 2 - 10);
    ctx.lineTo(15, h / 2 + 10);
    ctx.stroke();
  }

  // name
  ctx.fillStyle = p.isAI ? UI.cream : UI.gold;
  ctx.font = fontB(12, 800);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const name = p.isAI ? p.char.name : game.numHumans <= 1 ? 'You' : humanLabel(p);
  ctx.fillText(name, 46, 14);

  if (game.mode === 2) {
    // Golden mode: a hold-progress bar toward the win
    const bw = w - 56;
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRectPath(46, 26, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ffd23a';
    roundRectPath(46, 26, bw * Math.min(1, p.goldTime / game.goldTarget), 8, 4);
    ctx.fill();
  } else {
    // score pips
    const step = game.target > 6 ? 10 : 13;
    for (let i = 0; i < game.target; i++) {
      ctx.fillStyle = i < p.score ? p.char.body : 'rgba(255,255,255,.16)';
      ctx.beginPath();
      ctx.arc(50 + i * step, 30, game.target > 6 ? 3.4 : 4.2, 0, TAU);
      ctx.fill();
    }
  }

  // stacked power icons, wrapping to a second row so deep stacks stay readable
  if (p.powers.size) {
    let i = 0;
    const perRow = Math.floor((w - 96) / 14);
    for (const key of p.powers) {
      if (i >= perRow * 2) break; // beyond two rows: summarised by the "+"
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      drawPowerIcon(key, w - 12 - col * 14, 13 + row * 15, 5, POWERS[key].color);
      i++;
    }
    if (p.powers.size > perRow * 2) {
      ctx.fillStyle = UI.dim;
      ctx.font = fontB(9, 900);
      ctx.textAlign = 'right';
      ctx.fillText('+' + (p.powers.size - perRow * 2), w - 6, h - 7);
    }
  }
  ctx.restore();
}

/** Cooldown ability chips (dash / hop) pinned to the bottom-left corner. */
function drawAbilityChips(me: Player): void {
  const defs: { label: string; key: string; frac: number }[] = [
    { label: 'DASH', key: 'SPACE', frac: 1 - clamp(me.dashCd / (me.powers.has('SPEED') ? 0.22 : 0.7), 0, 1) },
    { label: 'HOP', key: 'SHIFT', frac: 1 - clamp(me.airCd / 0.85, 0, 1) },
  ];
  let x = WALL + 10;
  const y = H - WALL - 38;
  for (const d of defs) {
    const w = 96;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(13,8,22,.72)';
    roundRectPath(x, y, w, 28, 9);
    ctx.fill();
    // refill bar along the bottom edge
    ctx.fillStyle = d.frac >= 1 ? 'rgba(122,208,109,.9)' : 'rgba(255,206,84,.65)';
    roundRectPath(x + 3, y + 22, (w - 6) * d.frac, 3.5, 2);
    ctx.fill();
    keycap(x + 5, y + 3, d.key, 16);
    ctx.fillStyle = d.frac >= 1 ? UI.cream : 'rgba(255,243,223,.45)';
    ctx.font = fontB(11, 900);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.label, x + w - 8, y + 12);
    ctx.restore();
    x += w + 8;
  }
}

/** Power-pickup toasts: name + effect, sliding up from the bottom centre. */
function drawToasts(): void {
  const n = game.toasts.length;
  game.toasts.slice(-3).forEach((t, i, arr) => {
    const P = POWERS[t.key];
    const inK = clamp(t.t / 0.22, 0, 1); // slide in
    const outK = clamp((3 - t.t) / 0.4, 0, 1); // fade out
    const slot = arr.length - 1 - i; // 0 = newest (bottom)
    ctx.save();
    ctx.globalAlpha = Math.min(inK, outK);
    ctx.font = fontB(13, 800);
    const label = P.name.toUpperCase();
    const wName = ctx.measureText(label).width;
    ctx.font = fontB(12, 700);
    const wDesc = ctx.measureText(P.desc).width;
    const w = Math.max(wName, wDesc) + 58;
    const x = W / 2 - w / 2;
    const y = H - WALL - 52 - slot * 46 + (1 - inK) * 18;
    ctx.fillStyle = 'rgba(13,8,22,.82)';
    roundRectPath(x, y, w, 40, 12);
    ctx.fill();
    ctx.strokeStyle = P.color;
    ctx.lineWidth = 2;
    roundRectPath(x, y, w, 40, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath();
    ctx.arc(x + 22, y + 20, 13, 0, TAU);
    ctx.fill();
    drawPowerIcon(t.key, x + 22, y + 20, 8, P.color);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.color;
    ctx.font = fontB(13, 900);
    ctx.fillText(label, x + 42, y + 17);
    ctx.fillStyle = UI.cream;
    ctx.font = fontB(12, 700);
    ctx.fillText(P.desc, x + 42, y + 32);
    ctx.restore();
  });
  void n;
}

export function drawHUD(): void {
  // top scoreboard
  const n = game.players.length;
  const gap = 10;
  const cardW = Math.min(158, (W - WALL * 2 - 8 - (n - 1) * gap) / n);
  let sx = (W - (n * cardW + (n - 1) * gap)) / 2;
  for (const p of game.players) {
    drawCard(p, sx, 10, cardW, 46);
    sx += cardW + gap;
  }

  // objective banner
  let banner: string;
  if (game.mode === 2) banner = `GOLDEN BOOMERANG · ${arena.name.toUpperCase()} · hold ${game.goldTarget}s to win`;
  else if (game.mode === 1) banner = `TEAM UP · ${arena.name.toUpperCase()} · round ${game.roundNum} · first to ${game.target}`;
  else if (game.mode === 3) {
    const seeker = game.players.find((p) => p.role === 'seeker');
    const hidersLeft = game.players.filter((p) => p.role === 'hider' && p.alive).length;
    if (game.hsSetup > 0) banner = 'HIDE & SEEK · hiders, find a spot!';
    else banner = `HIDE & SEEK · ${Math.ceil(game.hsTimer)}s · ${hidersLeft} hidden · ${seeker ? seeker.attemptsLeft : 0} swings left`;
  } else banner = `${arena.name.toUpperCase()} · round ${game.roundNum} · first to ${game.target}`;
  pill(W / 2, 62, banner);

  // Battle Royale warning: a pulsing call to reach the closing safe ring
  if (game.br) {
    const left = Math.max(0, game.br.dur - game.br.t);
    ctx.save();
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(game.time * 8);
    pill(W / 2, 86, `⚠ BATTLE ROYALE — reach the ring! ${Math.ceil(left)}s`, 13, UI.red);
    ctx.restore();
  }

  const me = game.players.find((p) => !p.isAI);
  if (me && me.alive) drawAbilityChips(me);
  // a "YOU"/"P#" locator floats over each local human through the round's
  // opening (flipping below them when they spawn close to the scoreboard band)
  if (game.state === 'countdown' || game.fightT > 0) {
    for (const p of game.players) {
      if (p.isAI || !p.alive) continue;
      const label = humanLabel(p);
      const below = p.y < 150;
      const bob = Math.sin(game.time * 5) * 3;
      const yy = below ? p.y + p.r + 36 + bob : p.y - p.r - 26 + bob;
      ctx.save();
      ctx.font = fontD(15);
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = UI.ink;
      ctx.strokeText(label, p.x, yy);
      ctx.fillStyle = UI.gold;
      ctx.fillText(label, p.x, yy);
      ctx.beginPath();
      if (below) {
        ctx.moveTo(p.x - 5, yy - 16);
        ctx.lineTo(p.x + 5, yy - 16);
        ctx.lineTo(p.x, yy - 23);
      } else {
        ctx.moveTo(p.x - 5, yy + 4);
        ctx.lineTo(p.x + 5, yy + 4);
        ctx.lineTo(p.x, yy + 11);
      }
      ctx.closePath();
      ctx.fillStyle = UI.gold;
      ctx.fill();
      ctx.restore();
    }
  }

  drawToasts();
}

/** Compact score strip (round-over): every fighter's face + score pips. */
export function drawStandings(cy: number): void {
  const n = game.players.length;
  const w = 74;
  const total = n * w;
  let x = W / 2 - total / 2;
  for (const p of game.players) {
    ctx.save();
    ctx.translate(x + w / 2, cy);
    const isWinner = p === game.roundWinner;
    if (isWinner) {
      ctx.fillStyle = 'rgba(255,206,84,.14)';
      roundRectPath(-w / 2 + 4, -26, w - 8, 60, 10);
      ctx.fill();
    }
    ctx.save();
    ctx.scale(0.85, 0.85);
    ctx.translate(0, -6);
    p.char.draw(p.char, 17, [0, 0.2]);
    ctx.restore();
    if (!p.alive && game.mode !== 2) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ff5d6c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, -15);
      ctx.lineTo(10, 5);
      ctx.moveTo(10, -15);
      ctx.lineTo(-10, 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const step = game.target > 6 ? 7.5 : 10;
    for (let i = 0; i < game.target; i++) {
      ctx.fillStyle = i < p.score ? p.char.body : 'rgba(255,255,255,.2)';
      ctx.beginPath();
      ctx.arc((i - (game.target - 1) / 2) * step, 22, game.target > 6 ? 2.6 : 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    x += w;
  }
}

/** Big stroked headline with optional sub-line, centered on screen. */
export function drawCenterText(big: string, small: string | null, color: string): void {
  ctx.textAlign = 'center';
  ctx.save();
  ctx.font = fontD(74);
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = UI.ink;
  ctx.strokeText(big, W / 2, H / 2 - 6);
  ctx.fillStyle = color;
  ctx.fillText(big, W / 2, H / 2 - 6);
  if (small) {
    ctx.font = fontB(22, 800);
    ctx.lineWidth = 6;
    ctx.strokeText(small, W / 2, H / 2 + 44);
    ctx.fillStyle = UI.cream;
    ctx.fillText(small, W / 2, H / 2 + 44);
  }
  ctx.restore();
}

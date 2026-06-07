import { ctx } from '../core/canvas';
import { W, H } from '../constants';
import { TAU } from '../core/math';
import { POWERS } from '../data/powers';
import { roundRectPath } from '../gfx/shapes';
import { game } from '../game/state';

/** In-game scoreboard + round banner. */
export function drawHUD(): void {
  // top scoreboard
  const n = game.players.length;
  const cardW = 150;
  const gap = 12;
  const totalW = n * cardW + (n - 1) * gap;
  let sx = (W - totalW) / 2;
  for (const p of game.players) {
    ctx.save();
    ctx.translate(sx, 8);
    // card
    ctx.fillStyle = p.alive ? 'rgba(20,12,28,.7)' : 'rgba(20,12,28,.4)';
    roundRectPath(0, 0, cardW, 40, 10);
    ctx.fill();
    ctx.strokeStyle = p.char.body;
    ctx.lineWidth = 2;
    roundRectPath(0, 0, cardW, 40, 10);
    ctx.stroke();
    // mini face
    ctx.save();
    ctx.translate(24, 20);
    ctx.scale(0.62, 0.62);
    p.char.draw(p.char, 17, [0, 0]);
    ctx.restore();
    if (!p.alive) {
      ctx.strokeStyle = 'rgba(255,90,90,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, 8);
      ctx.lineTo(36, 32);
      ctx.moveTo(36, 8);
      ctx.lineTo(12, 32);
      ctx.stroke();
    }
    // name + tag
    ctx.fillStyle = '#fff3df';
    ctx.font = '700 13px "Trebuchet MS",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.isAI ? 'CPU ' + p.char.name : 'YOU', 44, 13);
    if (game.mode === 2) {
      // Golden mode: a hold-progress bar toward the win
      const bw = 86;
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      roundRectPath(48, 24, bw, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#ffd23a';
      roundRectPath(48, 24, bw * Math.min(1, p.goldTime / game.goldTarget), 7, 3);
      ctx.fill();
    } else {
      // score pips
      for (let i = 0; i < game.target; i++) {
        ctx.fillStyle = i < p.score ? p.char.body : 'rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.arc(48 + i * 14, 28, 4.5, 0, TAU);
        ctx.fill();
      }
    }
    // Team Up: a coloured stripe down the card's left edge marks the squad
    if (game.mode === 1 && p.team >= 0) {
      ctx.fillStyle = p.team === 0 ? '#5ad1ff' : '#ff7ad0';
      roundRectPath(2, 6, 5, 28, 2.5);
      ctx.fill();
    }
    // stacked power icons
    if (p.powers.size) {
      ctx.font = '700 13px "Trebuchet MS"';
      ctx.textAlign = 'right';
      let ix = cardW - 8;
      for (const key of p.powers) {
        const P = POWERS[key];
        ctx.fillStyle = P.color;
        ctx.fillText(P.icon, ix, 13);
        ix -= 15;
      }
    }
    // dual-wield marker
    if (p.boomsMax > 1) {
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '700 10px "Trebuchet MS"';
      ctx.textAlign = 'right';
      ctx.fillText('x' + p.boomsMax, cardW - 8, 34);
    }
    ctx.restore();
    sx += cardW + gap;
  }
  // round number / objective
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '700 14px "Trebuchet MS"';
  ctx.textAlign = 'center';
  let banner: string;
  if (game.mode === 2) banner = 'GOLDEN BOOMERANG  ·  hold it ' + game.goldTarget + 's to win';
  else if (game.mode === 1) banner = 'TEAM UP  ·  round ' + game.roundNum + '  ·  first to ' + game.target;
  else banner = 'ROUND ' + game.roundNum + '  ·  first to ' + game.target;
  ctx.fillText(banner, W / 2, 62);
}

/** Big stroked headline with optional sub-line, centered on screen. */
export function drawCenterText(big: string, small: string | null, color: string): void {
  ctx.textAlign = 'center';
  ctx.save();
  ctx.font = '900 72px "Trebuchet MS",sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1a1226';
  ctx.strokeText(big, W / 2, H / 2 - 6);
  ctx.fillStyle = color;
  ctx.fillText(big, W / 2, H / 2 - 6);
  if (small) {
    ctx.font = '700 24px "Trebuchet MS"';
    ctx.fillStyle = '#fff3df';
    ctx.fillText(small, W / 2, H / 2 + 44);
  }
  ctx.restore();
}

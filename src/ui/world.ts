import { ctx } from '../core/canvas';
import { TAU } from '../core/math';
import { W, H, WALL } from '../constants';
import { game } from '../game/state';
import type { Decoy } from '../game/state';
import { arena } from '../data/arena';
import { CHARS } from '../data/characters';
import { POWERS } from '../data/powers';
import { drawBoomShape, drawProp } from '../gfx/shapes';
import { drawArena } from './arena';

/** Weather overlay: slanting rain — or drifting snow on the ice biome. */
function drawWeather(): void {
  ctx.save();
  const t = game.time;
  if (arena.biome === 'ice') {
    // lazy snowflakes, deterministic field (no Math.random per frame)
    ctx.fillStyle = 'rgba(235,245,255,.5)';
    for (let i = 0; i < 70; i++) {
      const seed = i * 97.13;
      const x = ((seed * 13.7 + Math.sin(t * 0.7 + i) * 30) % (W - WALL * 2)) + WALL;
      const y = (((seed * 29.3 + t * 70) % (H - WALL * 2)) + (H - WALL * 2)) % (H - WALL * 2) + WALL;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 3) * 0.7, 0, TAU);
      ctx.fill();
    }
  } else {
    // cool wash over the play area
    ctx.fillStyle = 'rgba(90,130,180,.1)';
    ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
    ctx.strokeStyle = 'rgba(180,210,240,.32)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) {
      const seed = i * 97.13;
      const x = ((seed * 13.7) % (W - WALL * 2)) + WALL;
      const y = (((seed * 29.3 + t * 760) % (H - WALL * 2)) + (H - WALL * 2)) % (H - WALL * 2) + WALL;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Fading floor marks: explosion scorches, frost blooms. */
function drawDecals(): void {
  for (const d of game.decals) {
    const a = Math.min(1, d.t / Math.min(2, d.max)) * d.alpha; // hold, then fade out
    const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.1, d.x, d.y, d.r);
    g.addColorStop(0, `rgba(${d.rgb},${a})`);
    g.addColorStop(1, `rgba(${d.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, TAU);
    ctx.fill();
  }
}

/** The Golden Boomerang artifact (Golden mode only). */
function drawGolden(): void {
  const g = game.golden;
  if (!g) return;
  const y = g.y + Math.sin(g.bob * 2.5) * (g.carrier ? 0 : 4);
  ctx.save();
  ctx.shadowColor = '#ffd23a';
  ctx.shadowBlur = 22;
  // halo
  const rg = ctx.createRadialGradient(g.x, y, 2, g.x, y, 30);
  rg.addColorStop(0, 'rgba(255,210,58,.6)');
  rg.addColorStop(1, 'rgba(255,210,58,0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(g.x, y, 30, 0, TAU);
  ctx.fill();
  drawBoomShape(g.x, y, 15, g.bob * 7, '#ffd23a');
  ctx.restore();
}

/** A DECOY clone: a near-perfect copy of its owner with a tell-tale shimmer. */
function drawDecoy(d: Decoy): void {
  const c = CHARS[d.charIdx];
  const r = 17;
  const fade = Math.min(1, d.life / 0.6); // fade out over the final 0.6s
  const bobY = Math.sin(d.bob) * 1.8;
  // shadow
  ctx.save();
  ctx.globalAlpha = 0.9 * fade;
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + r * 0.95, r * 0.9, r * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.translate(d.x, d.y + bobY);
  // faint shimmer ring — the only giveaway it isn't the real fighter
  ctx.globalAlpha = (0.16 + 0.12 * Math.sin(game.time * 7)) * fade;
  ctx.strokeStyle = POWERS.DECOY.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r + 6, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.9 * fade;
  c.draw(c, r, d.aim);
  ctx.restore();
  // boomerang-in-hand indicators, mirroring the owner's count
  if (d.booms > 0) {
    const a = Math.atan2(d.aim[1], d.aim[0]);
    for (let i = 0; i < d.booms; i++) {
      const off = (i - (d.booms - 1) / 2) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.9 * fade;
      drawBoomShape(d.x + Math.cos(a + off) * (r + 9), d.y + bobY + Math.sin(a + off) * (r + 9), 7, game.time * 6, c.dark);
      ctx.restore();
    }
  }
}

/** Sudden death: a scorching band creeping in from the arena borders. */
function drawSudden(): void {
  if (!game.sudden || game.suddenEnc <= 0) return;
  const e = game.suddenEnc;
  const l = WALL + e;
  const t = WALL + e;
  const r = W - WALL - e;
  const b = H - WALL - e;
  ctx.save();
  // burnt wash over everything outside the safe rectangle
  ctx.fillStyle = 'rgba(255,70,25,.17)';
  ctx.beginPath();
  ctx.rect(WALL, WALL, W - WALL * 2, H - WALL * 2);
  ctx.rect(l, t, r - l, b - t);
  ctx.fill('evenodd');
  // the advancing fire line, flickering
  const pulse = 0.5 + 0.35 * Math.sin(game.time * 9);
  ctx.strokeStyle = `rgba(255,150,40,${pulse})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(l, t, r - l, b - t);
  ctx.restore();
}

/** Soft darkening toward the frame edges — cached once, gives the flat-lit
 *  field a touch of depth and pulls the eye to the action in the middle. */
let vigCanvas: HTMLCanvasElement | null = null;
function drawVignette(): void {
  if (!vigCanvas) {
    vigCanvas = document.createElement('canvas');
    vigCanvas.width = W;
    vigCanvas.height = H;
    const c = vigCanvas.getContext('2d')!;
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(10,6,16,0)');
    g.addColorStop(1, 'rgba(10,6,16,.4)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  ctx.drawImage(vigCanvas, 0, 0, W, H);
}

/** Battle Royale: a lethal red wash outside the closing safe circle. */
function drawBattleRoyale(): void {
  const br = game.br;
  if (!br) return;
  const r = Math.max(0, br.r);
  ctx.save();
  // fill everything OUTSIDE the safe circle (rect + reversed arc, even-odd)
  ctx.fillStyle = 'rgba(255,40,60,.15)';
  ctx.beginPath();
  ctx.rect(WALL, WALL, W - WALL * 2, H - WALL * 2);
  ctx.arc(br.cx, br.cy, r, 0, TAU, true);
  ctx.fill('evenodd');
  // the closing boundary ring, pulsing
  const pulse = 0.55 + 0.4 * Math.sin(game.time * 6);
  ctx.strokeStyle = `rgba(255,93,108,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(br.cx, br.cy, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Draws the live play-field: arena + all entities, depth-sorted by y. */
export function drawWorld(): void {
  drawArena();
  drawDecals(); // lasting scorches/frost sit directly on the floor
  // crusher travel grooves sit on the floor, under everything
  for (const c of game.crushers) c.drawTrack();
  // Hide & Seek decoy props — visually identical to a disguised hider
  for (const d of game.hsDecoys) {
    ctx.save();
    ctx.translate(d.x, d.y);
    drawProp(d.propIdx, 19);
    ctx.restore();
  }
  // hazards under players
  for (const h of game.hazards) h.draw();
  // pickups
  for (const pk of game.pickups) pk.draw();
  if (game.golden && !game.golden.carrier) drawGolden();
  // players + DECOY clones, depth-sorted together so overlap reads correctly
  const sorted = [...game.players.filter((p) => p.alive), ...game.decoys].sort((a, b) => a.y - b.y);
  for (const e of sorted) {
    if ('char' in e) e.draw();
    else drawDecoy(e);
  }
  // crusher blocks ride above fighters, so the squished vanish beneath them
  for (const c of game.crushers) c.draw();
  // a carried artifact rides above its holder
  if (game.golden && game.golden.carrier) drawGolden();
  // boomerangs on top
  for (const b of game.boomerangs) b.draw();
  // particles
  for (const p of game.particles) p.draw();
  // Battle Royale boundary overlay sits above the field
  if (game.br) drawBattleRoyale();
  // sudden-death fire band closes in over everything
  drawSudden();
  // weather overlay last, over the whole field
  if (game.raining) drawWeather();
  // vignette caps the frame for depth (HUD is drawn after, unaffected)
  drawVignette();
}

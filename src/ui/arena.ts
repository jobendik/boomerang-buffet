import { ctx, makeLayer } from '../core/canvas';
import { W, H, WALL } from '../constants';
import { arena, PITS, PORTALS, SPAWNS } from '../data/arena';
import { game } from '../game/state';
import { roundRectPath } from '../gfx/shapes';
import { TAU } from '../core/math';
import type { Biome, Rect } from '../types';

/**
 * Biome-themed arena rendering. Everything static (floor, decor, walls, pits,
 * bushes, obstacles, switch→gate hints) is painted once into an offscreen
 * layer and blitted each frame; only the animated bits (portals, switches,
 * gates) are redrawn live. Each biome gets its own floor treatment, wall frame
 * and obstacle furniture so no two arenas read as palette swaps.
 */

/* ------------------------------ tiny helpers ----------------------------- */

/** Deterministic per-arena RNG so decor doesn't reshuffle between frames. */
function seeded(seed: number): () => number {
  let s = (seed % 2147483647) || 1234567;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = ((h ^ str.charCodeAt(i)) * 16777619) >>> 0;
  return h;
}

/** roundRectPath against an arbitrary context (the cache layer). */
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Switch/gate pairs share a colour so the link reads at a glance. */
export const GATE_HUES = ['#ffd23a', '#7ad0ff', '#ff7ad0'];

const IN_W = W - WALL * 2;
const IN_H = H - WALL * 2;

/* ------------------------------- floors ---------------------------------- */

function paintFloor(c: CanvasRenderingContext2D, biome: Biome, rnd: () => number): void {
  c.fillStyle = arena.floorA;
  c.fillRect(WALL, WALL, IN_W, IN_H);

  if (biome === 'diner') {
    // warm checker tiles with grout seams
    const t = 56;
    for (let y = WALL, j = 0; y < H - WALL; y += t, j++) {
      for (let x = WALL, i = 0; x < W - WALL; x += t, i++) {
        if ((i + j) % 2 === 0) continue;
        c.fillStyle = arena.floorB;
        c.fillRect(x, y, Math.min(t, W - WALL - x), Math.min(t, H - WALL - y));
      }
    }
    c.strokeStyle = 'rgba(0,0,0,.18)';
    c.lineWidth = 2;
    for (let x = WALL + t; x < W - WALL; x += t) {
      c.beginPath();
      c.moveTo(x, WALL);
      c.lineTo(x, H - WALL);
      c.stroke();
    }
    for (let y = WALL + t; y < H - WALL; y += t) {
      c.beginPath();
      c.moveTo(WALL, y);
      c.lineTo(W - WALL, y);
      c.stroke();
    }
    // a few sauce splats & crumbs — lived-in, not sterile
    for (let i = 0; i < 5; i++) {
      const x = WALL + 60 + rnd() * (IN_W - 120);
      const y = WALL + 60 + rnd() * (IN_H - 120);
      c.fillStyle = rnd() < 0.5 ? 'rgba(190,70,55,.07)' : 'rgba(220,170,60,.07)';
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.ellipse(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26, 6 + rnd() * 9, 5 + rnd() * 7, rnd() * TAU, 0, TAU);
        c.fill();
      }
    }
  } else if (biome === 'rooftop') {
    // big slate pavers with bevelled edges + hairline cracks
    const t = 80;
    for (let y = WALL, j = 0; y < H - WALL; y += t, j++) {
      for (let x = WALL, i = 0; x < W - WALL; x += t, i++) {
        const w = Math.min(t, W - WALL - x);
        const h = Math.min(t, H - WALL - y);
        c.fillStyle = (i + j) % 2 ? arena.floorB : arena.floorA;
        c.fillRect(x, y, w, h);
        c.strokeStyle = 'rgba(255,255,255,.04)';
        c.lineWidth = 1.5;
        c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        c.strokeStyle = 'rgba(0,0,0,.25)';
        c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    c.strokeStyle = 'rgba(0,0,0,.3)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      let x = WALL + rnd() * IN_W;
      let y = WALL + rnd() * IN_H;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 50;
        y += (rnd() - 0.3) * 36;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (biome === 'neon') {
    // glossy dark floor with glowing grid seams
    const g = c.createLinearGradient(0, WALL, 0, H - WALL);
    g.addColorStop(0, arena.floorA);
    g.addColorStop(1, arena.floorB);
    c.fillStyle = g;
    c.fillRect(WALL, WALL, IN_W, IN_H);
    c.strokeStyle = 'rgba(255,122,208,.08)';
    c.lineWidth = 2;
    const t = 64;
    for (let x = WALL + t; x < W - WALL; x += t) {
      c.beginPath();
      c.moveTo(x, WALL);
      c.lineTo(x, H - WALL);
      c.stroke();
    }
    for (let y = WALL + t; y < H - WALL; y += t) {
      c.beginPath();
      c.moveTo(WALL, y);
      c.lineTo(W - WALL, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,122,208,.16)';
    for (let x = WALL + t; x < W - WALL; x += t) {
      for (let y = WALL + t; y < H - WALL; y += t) {
        c.beginPath();
        c.arc(x, y, 1.6, 0, TAU);
        c.fill();
      }
    }
  } else if (biome === 'grove') {
    // mottled grass: darker blotches, tufts and tiny flowers
    for (let i = 0; i < 70; i++) {
      c.fillStyle = i % 2 ? 'rgba(0,0,0,.07)' : 'rgba(180,230,120,.05)';
      c.beginPath();
      c.ellipse(WALL + rnd() * IN_W, WALL + rnd() * IN_H, 18 + rnd() * 36, 12 + rnd() * 22, rnd() * TAU, 0, TAU);
      c.fill();
    }
    c.strokeStyle = 'rgba(160,210,110,.3)';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = WALL + rnd() * IN_W;
      const y = WALL + rnd() * IN_H;
      for (const o of [-2.6, 0, 2.6]) {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + o, y - 4, x + o * 1.5, y - 7 - rnd() * 3);
        c.stroke();
      }
    }
    for (let i = 0; i < 14; i++) {
      const x = WALL + rnd() * IN_W;
      const y = WALL + rnd() * IN_H;
      c.fillStyle = ['#ffd6e8', '#fff3b0', '#cfe8ff'][i % 3];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU;
        c.beginPath();
        c.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.5, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#ffce54';
      c.beginPath();
      c.arc(x, y, 1.4, 0, TAU);
      c.fill();
    }
  } else {
    // ice: sheen streaks, hairline cracks, sparkles
    const g = c.createLinearGradient(WALL, WALL, W - WALL, H - WALL);
    g.addColorStop(0, arena.floorA);
    g.addColorStop(0.5, arena.floorB);
    g.addColorStop(1, arena.floorA);
    c.fillStyle = g;
    c.fillRect(WALL, WALL, IN_W, IN_H);
    c.save();
    c.beginPath();
    c.rect(WALL, WALL, IN_W, IN_H);
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 12; i++) {
      const x = rnd() * W;
      c.lineWidth = 10 + rnd() * 26;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 180, H);
      c.stroke();
    }
    c.strokeStyle = 'rgba(190,235,255,.16)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = WALL + rnd() * IN_W;
      let y = WALL + rnd() * IN_H;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (rnd() - 0.5) * 70;
        y += (rnd() - 0.5) * 50;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.arc(WALL + rnd() * IN_W, WALL + rnd() * IN_H, 0.5 + rnd(), 0, TAU);
      c.fill();
    }
    c.restore();
  }

  // soft directional light from the top + ambient-occlusion edges
  const light = c.createRadialGradient(W * 0.5, -80, 100, W * 0.5, H * 0.5, 760);
  light.addColorStop(0, 'rgba(255,236,200,.07)');
  light.addColorStop(1, 'rgba(0,0,0,.22)');
  c.fillStyle = light;
  c.fillRect(WALL, WALL, IN_W, IN_H);
  for (const [x, y, w, h, dx, dy] of [
    [WALL, WALL, IN_W, 16, 0, 1],
    [WALL, H - WALL - 16, IN_W, 16, 0, -1],
    [WALL, WALL, 16, IN_H, 1, 0],
    [W - WALL - 16, WALL, 16, IN_H, -1, 0],
  ] as const) {
    const ao = c.createLinearGradient(x, y, x + (dx ? 16 * dx : 0), y + (dy ? 16 * dy : 0));
    ao.addColorStop(0, 'rgba(0,0,0,.3)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ao;
    c.fillRect(x, y, w, h);
  }
}

/* -------------------------------- walls ----------------------------------- */

function paintWalls(c: CanvasRenderingContext2D, biome: Biome, rnd: () => number): void {
  const base: Record<Biome, string> = {
    diner: '#52332e',
    rooftop: '#26203a',
    neon: '#1c1230',
    grove: '#23351c',
    ice: '#1e2b42',
  };
  c.fillStyle = base[biome];
  c.fillRect(0, 0, W, WALL);
  c.fillRect(0, H - WALL, W, WALL);
  c.fillRect(0, 0, WALL, H);
  c.fillRect(W - WALL, 0, WALL, H);

  if (biome === 'diner') {
    // wood planks + brass studs
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.lineWidth = 2;
    for (let x = 40; x < W; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, WALL);
      c.moveTo(x + 24, H - WALL);
      c.lineTo(x + 24, H);
      c.stroke();
    }
    for (let y = 40; y < H; y += 64) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(WALL, y);
      c.moveTo(W - WALL, y + 24);
      c.lineTo(W, y + 24);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,214,140,.5)';
    for (const [x, y] of [[10, 10], [W - 11, 10], [10, H - 11], [W - 11, H - 11]] as const) {
      c.beginPath();
      c.arc(x, y, 3.4, 0, TAU);
      c.fill();
    }
  } else if (biome === 'rooftop') {
    // stone brick courses
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 2;
    for (let x = 0; x < W; x += 52) {
      for (const yy of [0, H - WALL]) {
        c.strokeRect(x + (yy ? 26 : 0), yy, 52, WALL);
      }
    }
    for (let y = 0; y < H; y += 52) {
      for (const xx of [0, W - WALL]) {
        c.strokeRect(xx, y + (xx ? 26 : 0), WALL, 52);
      }
    }
  } else if (biome === 'neon') {
    // smooth casing with an emissive strip
    c.strokeStyle = 'rgba(255,122,208,.5)';
    c.lineWidth = 2.5;
    c.strokeRect(WALL - 4, WALL - 4, W - (WALL - 4) * 2, H - (WALL - 4) * 2);
    c.strokeStyle = 'rgba(255,122,208,.14)';
    c.lineWidth = 7;
    c.strokeRect(WALL - 4, WALL - 4, W - (WALL - 4) * 2, H - (WALL - 4) * 2);
  } else if (biome === 'grove') {
    // clipped hedge: leafy lumps along every edge
    c.fillStyle = '#2e4a24';
    for (let x = 8; x < W; x += 22) {
      c.beginPath();
      c.arc(x, 6 + (x % 44 ? 6 : 0), 12, 0, TAU);
      c.arc(x + 8, H - 8 - (x % 44 ? 5 : 0), 12, 0, TAU);
      c.fill();
    }
    for (let y = 8; y < H; y += 22) {
      c.beginPath();
      c.arc(7 + (y % 44 ? 5 : 0), y, 12, 0, TAU);
      c.arc(W - 8 - (y % 44 ? 5 : 0), y + 8, 12, 0, TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(160,210,110,.18)';
    for (let i = 0; i < 60; i++) {
      const onTop = rnd() < 0.5;
      const along = rnd() * W;
      c.beginPath();
      c.arc(onTop ? along : rnd() < 0.5 ? 8 : W - 8, onTop ? (rnd() < 0.5 ? 8 : H - 8) : along, 4, 0, TAU);
      c.fill();
    }
  } else {
    // ice blocks + icicles dripping from the top wall
    c.strokeStyle = 'rgba(190,235,255,.16)';
    c.lineWidth = 2;
    for (let x = 0; x < W; x += 58) {
      c.strokeRect(x, 0, 58, WALL);
      c.strokeRect(x + 29, H - WALL, 58, WALL);
    }
    for (let y = 0; y < H; y += 58) {
      c.strokeRect(0, y, WALL, 58);
      c.strokeRect(W - WALL, y + 29, WALL, 58);
    }
    c.fillStyle = 'rgba(205,240,255,.32)';
    for (let x = 34; x < W - 40; x += 46 + rnd() * 40) {
      const len = 6 + rnd() * 10;
      c.beginPath();
      c.moveTo(x - 4, WALL);
      c.lineTo(x + 4, WALL);
      c.lineTo(x, WALL + len);
      c.closePath();
      c.fill();
    }
  }

  // shared inner trim so the play bounds always read crisply
  c.strokeStyle = arena.accent;
  c.globalAlpha = 0.55;
  c.lineWidth = 3;
  c.strokeRect(WALL - 1.5, WALL - 1.5, W - (WALL - 1.5) * 2, H - (WALL - 1.5) * 2);
  c.globalAlpha = 1;
}

/* ------------------------------ obstacles --------------------------------- */

function paintObstacle(c: CanvasRenderingContext2D, biome: Biome, R: Rect, rnd: () => number): void {
  // soft contact shadow (two passes fake a blur)
  c.fillStyle = 'rgba(0,0,0,.18)';
  rr(c, R.x + 5, R.y + 8, R.w, R.h, 12);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,.25)';
  rr(c, R.x + 3, R.y + 5, R.w, R.h, 12);
  c.fill();

  if (biome === 'diner') {
    // chrome-trimmed counter with a pastry-case top
    c.fillStyle = '#7e3b49';
    rr(c, R.x, R.y, R.w, R.h, 10);
    c.fill();
    c.fillStyle = '#ffe9c9';
    rr(c, R.x + 4, R.y + 4, R.w - 8, R.h - 12, 8);
    c.fill();
    c.fillStyle = '#f6d2a4';
    rr(c, R.x + 4, R.y + 4, R.w - 8, 8, 6);
    c.fill();
    // plate + mug props on roomier counters
    if (R.w >= 90) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(R.x + R.w * 0.32, R.y + R.h * 0.5, 11, 8, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#ffce54';
      c.beginPath();
      c.ellipse(R.x + R.w * 0.32, R.y + R.h * 0.5, 6, 4.4, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#b65c4f';
      rr(c, R.x + R.w * 0.62, R.y + R.h * 0.36, 13, 13, 4);
      c.fill();
    } else {
      c.fillStyle = 'rgba(182,92,79,.8)';
      c.beginPath();
      c.ellipse(R.x + R.w / 2, R.y + R.h / 2 - 2, R.w * 0.2, R.h * 0.16, 0, 0, TAU);
      c.fill();
    }
    c.strokeStyle = 'rgba(255,206,84,.5)';
    c.lineWidth = 2;
    rr(c, R.x, R.y, R.w, R.h, 10);
    c.stroke();
  } else if (biome === 'rooftop') {
    // weathered stone pillar
    c.fillStyle = '#3f3b58';
    rr(c, R.x, R.y, R.w, R.h, 9);
    c.fill();
    c.fillStyle = '#56516f';
    rr(c, R.x + 4, R.y + 4, R.w - 8, R.h - 10, 7);
    c.fill();
    c.fillStyle = '#6b6585';
    rr(c, R.x + 4, R.y + 4, R.w - 8, 9, 5);
    c.fill();
    c.fillStyle = 'rgba(122,208,255,.25)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(R.x + 8 + rnd() * (R.w - 16), R.y + 10 + rnd() * (R.h - 18), 2, 0, TAU);
      c.fill();
    }
  } else if (biome === 'neon') {
    // arcade cabinet block with an emissive rim
    c.fillStyle = '#241636';
    rr(c, R.x, R.y, R.w, R.h, 10);
    c.fill();
    c.fillStyle = '#382152';
    rr(c, R.x + 4, R.y + 4, R.w - 8, R.h - 8, 8);
    c.fill();
    c.strokeStyle = arena.accent;
    c.globalAlpha = 0.85;
    c.lineWidth = 2.5;
    rr(c, R.x + 2, R.y + 2, R.w - 4, R.h - 4, 9);
    c.stroke();
    c.globalAlpha = 0.22;
    c.lineWidth = 7;
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (const [ex, ey] of [[R.x + 8, R.y + 8], [R.x + R.w - 8, R.y + 8], [R.x + 8, R.y + R.h - 8], [R.x + R.w - 8, R.y + R.h - 8]] as const) {
      c.beginPath();
      c.arc(ex, ey, 1.8, 0, TAU);
      c.fill();
    }
  } else if (biome === 'grove') {
    if (R.w / R.h > 1.6) {
      // fallen log: bark capsule with end rings
      c.fillStyle = '#5d4030';
      rr(c, R.x, R.y, R.w, R.h, R.h / 2);
      c.fill();
      c.fillStyle = '#7a5640';
      rr(c, R.x + 3, R.y + 3, R.w - 6, R.h - 9, (R.h - 9) / 2);
      c.fill();
      c.strokeStyle = 'rgba(50,32,22,.5)';
      c.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const yy = R.y + 7 + i * ((R.h - 14) / 2);
        c.beginPath();
        c.moveTo(R.x + 12, yy);
        c.lineTo(R.x + R.w - 12, yy + (i % 2 ? 2 : -2));
        c.stroke();
      }
      c.fillStyle = '#caa66a';
      c.beginPath();
      c.ellipse(R.x + R.w - 8, R.y + R.h / 2 - 2, 7, R.h / 2 - 4, 0, 0, TAU);
      c.fill();
      c.strokeStyle = '#8a6a44';
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(R.x + R.w - 8, R.y + R.h / 2 - 2, 3.6, R.h / 4 - 2, 0, 0, TAU);
      c.stroke();
    } else {
      // mossy boulder
      c.fillStyle = '#5a5a52';
      rr(c, R.x, R.y, R.w, R.h, 18);
      c.fill();
      c.fillStyle = '#74746a';
      rr(c, R.x + 5, R.y + 4, R.w - 10, R.h - 12, 14);
      c.fill();
      c.fillStyle = 'rgba(120,170,80,.55)';
      c.beginPath();
      c.ellipse(R.x + R.w * 0.3, R.y + 6, R.w * 0.22, 5, 0.2, 0, TAU);
      c.ellipse(R.x + R.w * 0.7, R.y + 9, R.w * 0.16, 4, -0.3, 0, TAU);
      c.fill();
    }
  } else {
    // ice block: translucent body, crisp rim light, inner glints
    c.fillStyle = 'rgba(160,210,245,.34)';
    rr(c, R.x, R.y, R.w, R.h, 10);
    c.fill();
    c.fillStyle = 'rgba(205,238,255,.3)';
    rr(c, R.x + 4, R.y + 4, R.w - 8, R.h * 0.42, 7);
    c.fill();
    c.strokeStyle = 'rgba(225,245,255,.8)';
    c.lineWidth = 2;
    rr(c, R.x, R.y, R.w, R.h, 10);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(R.x + R.w * 0.22, R.y + R.h * 0.6);
    c.lineTo(R.x + R.w * 0.42, R.y + R.h * 0.28);
    c.moveTo(R.x + R.w * 0.6, R.y + R.h * 0.72);
    c.lineTo(R.x + R.w * 0.78, R.y + R.h * 0.4);
    c.stroke();
  }
}

/* ----------------------------- pits & bushes ------------------------------ */

function paintPit(c: CanvasRenderingContext2D, P: Rect): void {
  // painted hazard dashes on the lip
  c.save();
  c.strokeStyle = 'rgba(255,206,84,.3)';
  c.lineWidth = 3;
  c.setLineDash([10, 8]);
  rr(c, P.x - 7, P.y - 7, P.w + 14, P.h + 14, 16);
  c.stroke();
  c.setLineDash([]);
  // the void: deep gradient + inner top shadow + bottom rim light
  c.fillStyle = '#0b0712';
  rr(c, P.x, P.y, P.w, P.h, 14);
  c.fill();
  c.save();
  rr(c, P.x, P.y, P.w, P.h, 14);
  c.clip();
  const g = c.createLinearGradient(0, P.y, 0, P.y + P.h);
  g.addColorStop(0, 'rgba(0,0,0,.9)');
  g.addColorStop(0.7, 'rgba(36,18,52,.25)');
  g.addColorStop(1, 'rgba(86,48,120,.3)');
  c.fillStyle = g;
  c.fillRect(P.x, P.y, P.w, P.h);
  // faint floating motes down in the dark
  c.fillStyle = 'rgba(160,120,220,.25)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(P.x + ((i * 73) % P.w), P.y + P.h * 0.5 + ((i * 37) % (P.h * 0.45)), 1.2, 0, TAU);
    c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(150,110,190,.5)';
  c.lineWidth = 2;
  rr(c, P.x, P.y, P.w, P.h, 14);
  c.stroke();
  c.restore();
}

function paintBush(c: CanvasRenderingContext2D, biome: Biome, B: Rect, rnd: () => number): void {
  const cx = B.x + B.w / 2;
  const cy = B.y + B.h / 2;
  const cols: Record<Biome, [string, string, string]> = {
    diner: ['rgba(40,74,36,.9)', 'rgba(66,112,50,.94)', 'rgba(112,160,76,.6)'],
    rooftop: ['rgba(38,66,44,.9)', 'rgba(58,98,62,.94)', 'rgba(100,150,96,.55)'],
    neon: ['rgba(34,60,66,.9)', 'rgba(46,96,96,.94)', 'rgba(96,180,160,.5)'],
    grove: ['rgba(46,82,38,.92)', 'rgba(78,128,56,.95)', 'rgba(130,180,88,.6)'],
    ice: ['rgba(52,88,110,.9)', 'rgba(86,130,156,.92)', 'rgba(170,220,240,.55)'],
  };
  const [dark, mid, lite] = cols[biome];
  c.save();
  // grounding shadow
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.beginPath();
  c.ellipse(cx, cy + B.h * 0.38, B.w * 0.5, B.h * 0.24, 0, 0, TAU);
  c.fill();
  c.fillStyle = dark;
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU;
    c.beginPath();
    c.arc(cx + Math.cos(a) * B.w * 0.32, cy + Math.sin(a) * B.h * 0.32, B.w * 0.3, 0, TAU);
    c.fill();
  }
  c.fillStyle = mid;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + 0.4;
    c.beginPath();
    c.arc(cx + Math.cos(a) * B.w * 0.24, cy + Math.sin(a) * B.h * 0.22, B.w * 0.26, 0, TAU);
    c.fill();
  }
  c.fillStyle = lite;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 1.1;
    c.beginPath();
    c.ellipse(cx + Math.cos(a) * B.w * 0.18, cy + Math.sin(a) * B.h * 0.16 - 2, B.w * 0.1, B.h * 0.055, a, 0, TAU);
    c.fill();
  }
  // a few seeded berries/snow clumps for character
  c.fillStyle = biome === 'ice' ? 'rgba(240,250,255,.8)' : 'rgba(255,120,140,.8)';
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(cx + (rnd() - 0.5) * B.w * 0.5, cy + (rnd() - 0.5) * B.h * 0.4, 2.2, 0, TAU);
    c.fill();
  }
  c.restore();
}

/* ------------------------- static cache management ------------------------ */

let cache: { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null = null;
let cacheKey = '';

function renderStatic(): void {
  if (!cache) cache = makeLayer();
  const c = cache.c;
  const rnd = seeded(hash(arena.name));
  c.clearRect(0, 0, W, H);

  paintFloor(c, arena.biome, rnd);

  // spawn pads — subtle discs marking where fighters drop in
  c.strokeStyle = arena.accent;
  c.globalAlpha = 0.14;
  c.lineWidth = 2;
  for (const s of SPAWNS) {
    c.beginPath();
    c.arc(s.x, s.y, 14, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(s.x, s.y, 3, 0, TAU);
    c.stroke();
  }
  c.globalAlpha = 1;

  // switch→gate link hints, colour-coded per pair
  for (const s of arena.switches) {
    const g = arena.gates[s.gate];
    if (!g) continue;
    const hue = GATE_HUES[s.gate % GATE_HUES.length];
    c.save();
    c.strokeStyle = hue;
    c.globalAlpha = 0.16;
    c.lineWidth = 2.5;
    c.setLineDash([3, 9]);
    c.beginPath();
    c.moveTo(s.x, s.y);
    c.lineTo(g.x + g.w / 2, g.y + g.h / 2);
    c.stroke();
    c.restore();
  }

  for (const P of PITS) paintPit(c, P);
  for (const B of arena.bushes) paintBush(c, arena.biome, B, rnd);
  for (const R of arena.obstacles) paintObstacle(c, arena.biome, R, rnd);
  paintWalls(c, arena.biome, rnd);

  // gentle vignette so the eye stays on the action
  const v = c.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 660);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,4,16,.32)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}

/* ------------------------------ dynamic bits ------------------------------ */

// per-gate open/close animation state (visual only)
const gateAnim = new WeakMap<object, number>();
let lastAnimT = 0;

function drawPortals(): void {
  for (const P of PORTALS) {
    for (const node of [[P.ax, P.ay], [P.bx, P.by]] as const) {
      ctx.save();
      ctx.translate(node[0], node[1]);
      const t = game.time;
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, P.r + 10);
      rg.addColorStop(0, 'rgba(150,255,214,.4)');
      rg.addColorStop(1, 'rgba(60,200,160,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, P.r + 10, 0, TAU);
      ctx.fill();
      // counter-rotating swirl arcs sell the "wormhole"
      ctx.strokeStyle = '#8affd6';
      ctx.lineCap = 'round';
      for (const dir of [1, -1]) {
        ctx.lineWidth = dir > 0 ? 3 : 2;
        ctx.globalAlpha = dir > 0 ? 0.95 : 0.5;
        for (let k = 0; k < 2; k++) {
          const a0 = t * 2.4 * dir + k * Math.PI;
          ctx.beginPath();
          ctx.arc(0, 0, P.r * (dir > 0 ? 0.96 : 0.62), a0, a0 + Math.PI * 0.72);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(190,255,232,.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawSwitches(): void {
  for (const s of game.switches) {
    const hue = GATE_HUES[s.gate % GATE_HUES.length];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.arc(0, 3, s.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = s.pressed ? '#4c4426' : '#3b3550';
    ctx.beginPath();
    ctx.arc(0, 0, s.r, 0, TAU);
    ctx.fill();
    // inner cap sinks slightly when pressed
    ctx.fillStyle = s.pressed ? hue : '#574d72';
    ctx.beginPath();
    ctx.arc(0, s.pressed ? 1.5 : -1.5, s.r * 0.62, 0, TAU);
    ctx.fill();
    // pair-colour tick marks around the rim
    ctx.strokeStyle = hue;
    ctx.globalAlpha = s.pressed ? 1 : 0.55;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (s.r - 4), Math.sin(a) * (s.r - 4));
      ctx.lineTo(Math.cos(a) * (s.r + 1), Math.sin(a) * (s.r + 1));
      ctx.stroke();
    }
    if (s.pressed) {
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(game.time * 9);
      ctx.beginPath();
      ctx.arc(0, 0, s.r + 5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawGates(dt: number): void {
  game.gates.forEach((g, gi) => {
    const hue = GATE_HUES[gi % GATE_HUES.length];
    let k = gateAnim.get(g) ?? (g.open ? 1 : 0);
    const goal = g.open ? 1 : 0;
    k += (goal - k) * Math.min(1, dt * 9);
    gateAnim.set(g, k);

    // recessed floor slot (always visible so the close is readable)
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRectPath(g.x, g.y, g.w, g.h, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 1.5;
    roundRectPath(g.x, g.y, g.w, g.h, 5);
    ctx.stroke();

    if (k > 0.97) return; // fully open: just the slot

    // the bar slides into the slot along its long axis as it opens
    const along = g.w >= g.h;
    const vis = 1 - k;
    const bw = along ? g.w * vis : g.w;
    const bh = along ? g.h : g.h * vis;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x - 2, g.y - 4, g.w + 4, g.h + 6);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    roundRectPath(g.x + 2, g.y + 3, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#6a6276';
    roundRectPath(g.x, g.y, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#857c92';
    roundRectPath(g.x + 2.5, g.y + 2.5, Math.max(2, bw - 5), Math.max(2, bh - 5), 4);
    ctx.fill();
    // rivets along the bar's long axis
    ctx.fillStyle = 'rgba(40,32,52,.7)';
    const n = Math.max(2, Math.floor((along ? bw : bh) / 24));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      ctx.beginPath();
      ctx.arc(along ? g.x + bw * t : g.x + g.w / 2, along ? g.y + g.h / 2 : g.y + bh * t, 2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = hue;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    roundRectPath(g.x, g.y, bw, bh, 5);
    ctx.stroke();
    ctx.restore();
  });
}

/** Draws the arena: cached static art + live portals/switches/gates. */
export function drawArena(): void {
  if (cacheKey !== arena.name) {
    renderStatic();
    cacheKey = arena.name;
  }
  ctx.drawImage(cache!.cv, 0, 0, W, H);

  const dt = Math.max(0, Math.min(0.05, game.time - lastAnimT));
  lastAnimT = game.time;

  drawPortals();
  drawSwitches();
  drawGates(dt);
}

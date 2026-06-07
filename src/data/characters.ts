import { ctx } from '../core/canvas';
import { clamp, rand, TAU } from '../core/math';
import { roundRectPath } from '../gfx/shapes';
import type { Char, Vec2 } from '../types';

/** Original cute-food fighters, each a simple procedural vector drawing. */

function eyes(r: number, look: Vec2): void {
  // look: aim vector for pupils; r: radius
  const lx = clamp(look[0], -1, 1) * r * 0.18;
  const ly = clamp(look[1], -1, 1) * r * 0.18;
  const ex = r * 0.34;
  const ey = -r * 0.06;
  const er = r * 0.26;
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * ex, ey, er, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241a2b';
    ctx.beginPath();
    ctx.arc(s * ex + lx, ey + ly, er * 0.5, 0, TAU);
    ctx.fill();
  }
}

function mouthSmile(r: number): void {
  ctx.strokeStyle = 'rgba(40,20,30,.7)';
  ctx.lineWidth = Math.max(1.6, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.34, r * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function drawAvo(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.04, r * 0.78, r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(0, r * 0.34, r * 0.34, 0, TAU);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

function drawToast(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  roundRectPath(-r, -r, r * 2, r * 2, r * 0.4);
  ctx.fill();
  ctx.fillStyle = c.body;
  roundRectPath(-r * 0.82, -r * 0.7, r * 1.64, r * 1.62, r * 0.34);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

function drawEgg(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const rr = r * (0.92 + 0.16 * Math.sin(a * 3 + 1));
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(0, r * 0.02, r * 0.5, 0, TAU);
  ctx.fill();
  eyes(r * 0.9, look);
  mouthSmile(r * 0.9);
}

function drawBerry(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, r * 1.05);
  ctx.bezierCurveTo(r * 1.05, r * 0.4, r * 0.95, -r * 0.7, 0, -r * 0.75);
  ctx.bezierCurveTo(-r * 0.95, -r * 0.7, -r * 1.05, r * 0.4, 0, r * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 7; i++) {
    const a = rand(0, TAU);
    const rr = rand(0.15, 0.7) * r;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.9 + r * 0.1, r * 0.06, r * 0.1, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.accent;
  for (const s of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.35, -r * 0.7, r * 0.22, r * 0.12, s * 0.5, 0, TAU);
    ctx.fill();
  }
  eyes(r, look);
  mouthSmile(r);
}

function drawBroc(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.accent;
  roundRectPath(-r * 0.34, r * 0.2, r * 0.68, r * 0.9, r * 0.2);
  ctx.fill();
  ctx.fillStyle = c.dark;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.5 - r * 0.1, r * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, -r * 0.12, r * 0.7, 0, TAU);
  ctx.fill();
  eyes(r * 0.95, look);
  mouthSmile(r * 0.95);
}

function drawOrange(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.3, r * 0.16, -0.6, 0, TAU);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

export const CHARS: Char[] = [
  { name: 'Avo', body: '#7fc242', dark: '#5a9430', accent: '#7a4a2a', draw: drawAvo },
  { name: 'Toastie', body: '#f2c177', dark: '#c98f43', accent: '#8a5a2a', draw: drawToast },
  { name: 'Sunny', body: '#fbfaf2', dark: '#d9d6c2', accent: '#ffcf3f', draw: drawEgg },
  { name: 'Berry', body: '#ff5d6c', dark: '#d83b4c', accent: '#7ad06d', draw: drawBerry },
  { name: 'Brock', body: '#5fae57', dark: '#3f8a3a', accent: '#caa66a', draw: drawBroc },
  { name: 'Citra', body: '#ff9f33', dark: '#e07d12', accent: '#ffd98a', draw: drawOrange },
];

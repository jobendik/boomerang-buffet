import type { Vec2 } from '../types';

/** Math & vector helpers shared across the game. */

export const TAU = Math.PI * 2;

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const randi = (a: number, b: number): number => Math.floor(rand(a, b + 1));

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

export const norm = (x: number, y: number): Vec2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

export const angLerp = (a: number, b: number, t: number): number => {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};

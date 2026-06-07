import type { Rect, Spawn } from '../types';

/** Static arena layout: diner-counter obstacles and player spawn points. */

export const OBSTACLES: Rect[] = [
  { x: 462, y: 280, w: 100, h: 80 },
  { x: 180, y: 150, w: 72, h: 72 },
  { x: 772, y: 150, w: 72, h: 72 },
  { x: 180, y: 418, w: 72, h: 72 },
  { x: 772, y: 418, w: 72, h: 72 },
];

export const SPAWNS: Spawn[] = [
  { x: 110, y: 110 },
  { x: 914, y: 110 },
  { x: 110, y: 530 },
  { x: 914, y: 530 },
  { x: 512, y: 92 },
  { x: 512, y: 548 },
];

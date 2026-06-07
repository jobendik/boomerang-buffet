import type { Arena, Rect, Spawn, Portal } from '../types';

/**
 * Selectable arenas. Geometry/spawns/hazards for the *current* arena are
 * published as live bindings (`OBSTACLES`, `SPAWNS`, `PITS`, `PORTALS`) that
 * `setArena` reassigns — so the rest of the codebase keeps importing them by
 * name and transparently sees whichever arena is in play.
 */

export const ARENAS: Arena[] = [
  {
    name: 'Diner',
    floorA: '#33263f',
    floorB: '#2d2138',
    accent: '#ffce54',
    obstacles: [
      { x: 462, y: 280, w: 100, h: 80 },
      { x: 180, y: 150, w: 72, h: 72 },
      { x: 772, y: 150, w: 72, h: 72 },
      { x: 180, y: 418, w: 72, h: 72 },
      { x: 772, y: 418, w: 72, h: 72 },
    ],
    pits: [],
    portals: [],
    spawns: [
      { x: 110, y: 110 },
      { x: 914, y: 110 },
      { x: 110, y: 530 },
      { x: 914, y: 530 },
      { x: 512, y: 92 },
      { x: 512, y: 548 },
    ],
  },
  {
    name: 'Pitfall',
    floorA: '#2b2a3f',
    floorB: '#252339',
    accent: '#7ad0ff',
    obstacles: [
      { x: 472, y: 96, w: 80, h: 56 },
      { x: 472, y: 488, w: 80, h: 56 },
    ],
    // a yawning chasm down each flank plus a central rift
    pits: [
      { x: 150, y: 250, w: 120, h: 140 },
      { x: 754, y: 250, w: 120, h: 140 },
      { x: 462, y: 270, w: 100, h: 100 },
    ],
    portals: [],
    spawns: [
      { x: 90, y: 90 },
      { x: 934, y: 90 },
      { x: 90, y: 550 },
      { x: 934, y: 550 },
      { x: 512, y: 60 },
      { x: 512, y: 580 },
    ],
  },
  {
    name: 'Crossfire',
    floorA: '#382740',
    floorB: '#31223a',
    accent: '#ff7ad0',
    obstacles: [
      { x: 300, y: 140, w: 64, h: 64 },
      { x: 660, y: 140, w: 64, h: 64 },
      { x: 300, y: 436, w: 64, h: 64 },
      { x: 660, y: 436, w: 64, h: 64 },
      { x: 480, y: 290, w: 64, h: 60 },
    ],
    pits: [{ x: 482, y: 60, w: 60, h: 60 }],
    // diagonally-linked teleporters keep the action looping across the map
    portals: [
      { ax: 120, ay: 320, bx: 904, by: 320, r: 26 },
      { ax: 512, ay: 540, bx: 512, by: 150, r: 26 },
    ],
    spawns: [
      { x: 110, y: 110 },
      { x: 914, y: 110 },
      { x: 110, y: 530 },
      { x: 914, y: 530 },
      { x: 200, y: 320 },
      { x: 824, y: 320 },
    ],
  },
];

/** The arena currently in play (live binding; reassigned by `setArena`). */
export let arena: Arena = ARENAS[0];
export let OBSTACLES: Rect[] = arena.obstacles;
export let SPAWNS: Spawn[] = arena.spawns;
export let PITS: Rect[] = arena.pits;
export let PORTALS: Portal[] = arena.portals;

/** Select the active arena by index, republishing the live bindings. */
export function setArena(i: number): void {
  arena = ARENAS[((i % ARENAS.length) + ARENAS.length) % ARENAS.length];
  OBSTACLES = arena.obstacles;
  SPAWNS = arena.spawns;
  PITS = arena.pits;
  PORTALS = arena.portals;
}

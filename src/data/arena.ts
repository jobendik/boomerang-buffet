import type { Arena, Rect, Spawn, Portal, CrusherDef, SwitchDef, GateDef } from '../types';

/**
 * Selectable arenas. Geometry/spawns/hazards for the *current* arena are
 * published as live bindings (`OBSTACLES`, `SPAWNS`, `PITS`, `PORTALS`) that
 * `setArena` reassigns — so the rest of the codebase keeps importing them by
 * name and transparently sees whichever arena is in play.
 *
 * Layout rules of thumb (kept true for every map):
 *  · spawns sit ≥ 40px clear of solids, pits, crusher sweeps & portal triggers
 *  · layouts are mirror- or point-symmetric so no spawn is favoured
 *  · every gate has a readable switch nearby; pairs are colour-coded in the UI
 */

export const ARENAS: Arena[] = [
  {
    name: 'Diner',
    tagline: 'Counters, crushers & a locked lunch pass',
    biome: 'diner',
    floorA: '#3b2a35',
    floorB: '#332430',
    accent: '#ffce54',
    obstacles: [
      { x: 452, y: 290, w: 120, h: 60 }, // central serving counter
      { x: 170, y: 140, w: 72, h: 72 },
      { x: 782, y: 140, w: 72, h: 72 },
      { x: 170, y: 428, w: 72, h: 72 },
      { x: 782, y: 428, w: 72, h: 72 },
    ],
    pits: [],
    bushes: [
      { x: 300, y: 290, w: 84, h: 72 },
      { x: 640, y: 290, w: 84, h: 72 },
    ],
    crushers: [
      { x: 368, y: 64, w: 56, h: 56, dx: 0, dy: 150, period: 3.2, phase: 0 },
      { x: 600, y: 520, w: 56, h: 56, dx: 0, dy: -150, period: 3.2, phase: 0.5 },
    ],
    portals: [],
    // the "lunch pass": a gate sealing the corridor south of the counter —
    // either flank switch springs it open
    gates: [{ x: 452, y: 368, w: 120, h: 22 }],
    switches: [
      { x: 140, y: 320, r: 22, gate: 0 },
      { x: 884, y: 320, r: 22, gate: 0 },
    ],
    spawns: [
      { x: 95, y: 95 },
      { x: 929, y: 95 },
      { x: 95, y: 545 },
      { x: 929, y: 545 },
      { x: 512, y: 104 },
      { x: 512, y: 560 },
    ],
  },
  {
    name: 'Pitfall',
    tagline: 'Mind the gap — dash or hop the void',
    biome: 'rooftop',
    floorA: '#2b2a3f',
    floorB: '#252339',
    accent: '#7ad0ff',
    // four pillars frame an open heart; chasms force risky crossings
    obstacles: [
      { x: 340, y: 150, w: 60, h: 60 },
      { x: 624, y: 150, w: 60, h: 60 },
      { x: 340, y: 430, w: 60, h: 60 },
      { x: 624, y: 430, w: 60, h: 60 },
    ],
    pits: [
      { x: 150, y: 250, w: 120, h: 140 },
      { x: 754, y: 250, w: 120, h: 140 },
      { x: 462, y: 270, w: 100, h: 100 },
    ],
    bushes: [
      { x: 386, y: 268, w: 72, h: 84 },
      { x: 566, y: 268, w: 72, h: 84 },
    ],
    crushers: [],
    // a vertical shortcut linking the two safe lanes over the centre rift
    portals: [{ ax: 512, ay: 84, bx: 512, by: 556, r: 24 }],
    gates: [],
    switches: [],
    spawns: [
      { x: 95, y: 95 },
      { x: 929, y: 95 },
      { x: 95, y: 545 },
      { x: 929, y: 545 },
      { x: 86, y: 320 },
      { x: 938, y: 320 },
    ],
  },
  {
    name: 'Crossfire',
    tagline: 'Portals loop the field, pistons sweep it',
    biome: 'neon',
    floorA: '#2d1f3d',
    floorB: '#271a35',
    accent: '#ff7ad0',
    obstacles: [
      { x: 288, y: 132, w: 64, h: 64 },
      { x: 672, y: 132, w: 64, h: 64 },
      { x: 288, y: 444, w: 64, h: 64 },
      { x: 672, y: 444, w: 64, h: 64 },
      { x: 476, y: 284, w: 72, h: 72 }, // centre block
    ],
    pits: [],
    bushes: [
      { x: 140, y: 178, w: 84, h: 72 },
      { x: 800, y: 178, w: 84, h: 72 },
      { x: 140, y: 390, w: 84, h: 72 },
      { x: 800, y: 390, w: 84, h: 72 },
    ],
    // twin pistons sweep the mid lane up to (never into) each gate
    crushers: [
      { x: 96, y: 292, w: 52, h: 56, dx: 240, dy: 0, period: 3.6, phase: 0 },
      { x: 876, y: 292, w: 52, h: 56, dx: -240, dy: 0, period: 3.6, phase: 0.5 },
    ],
    // bottom corners loop to each other; a centre pair leaps the mid block
    portals: [
      { ax: 140, ay: 512, bx: 884, by: 512, r: 24 },
      { ax: 512, ay: 160, bx: 512, by: 540, r: 24 },
    ],
    // each gate walls off one side of the centre block; its switch sits on the
    // diagonally opposite approach, so opening a lane is a commitment
    gates: [
      { x: 404, y: 284, w: 20, h: 72 },
      { x: 600, y: 284, w: 20, h: 72 },
    ],
    switches: [
      { x: 320, y: 232, r: 20, gate: 0 },
      { x: 704, y: 408, r: 20, gate: 1 },
    ],
    spawns: [
      { x: 95, y: 95 },
      { x: 929, y: 95 },
      { x: 95, y: 545 },
      { x: 929, y: 545 },
      { x: 512, y: 100 },
      { x: 512, y: 576 },
    ],
  },
  {
    name: 'Grove',
    tagline: 'Leafy cover for sneaky snacks',
    biome: 'grove',
    floorA: '#2c3a24',
    floorB: '#26331f',
    accent: '#9bd17a',
    // mossy logs for cover; the leafy theme leans on its many bushes
    obstacles: [
      { x: 240, y: 120, w: 90, h: 40 },
      { x: 694, y: 120, w: 90, h: 40 },
      { x: 240, y: 480, w: 90, h: 40 },
      { x: 694, y: 480, w: 90, h: 40 },
      { x: 472, y: 290, w: 80, h: 60 },
    ],
    pits: [], // pit-free, so the 5% rain roll can land here
    bushes: [
      { x: 150, y: 270, w: 92, h: 84 },
      { x: 782, y: 270, w: 92, h: 84 },
      { x: 440, y: 150, w: 92, h: 70 },
      { x: 440, y: 420, w: 92, h: 70 },
    ],
    crushers: [],
    // a single shortcut portal across the grove
    portals: [{ ax: 130, ay: 140, bx: 894, by: 500, r: 26 }],
    gates: [],
    switches: [],
    spawns: [
      { x: 95, y: 95 },
      { x: 929, y: 95 },
      { x: 95, y: 545 },
      { x: 929, y: 545 },
      { x: 512, y: 104 },
      { x: 512, y: 556 },
    ],
  },
  {
    name: 'Freezer',
    tagline: 'Slippery floors & a piston-guarded vault',
    biome: 'ice',
    slick: true, // icy footing — acceleration & braking go drifty
    floorA: '#2a3950',
    floorB: '#243348',
    accent: '#9fd6ff',
    obstacles: [
      { x: 180, y: 150, w: 70, h: 70 },
      { x: 774, y: 150, w: 70, h: 70 },
      { x: 180, y: 420, w: 70, h: 70 },
      { x: 774, y: 420, w: 70, h: 70 },
      // the cold-room vault: two long shelves form a centre chamber
      { x: 400, y: 180, w: 224, h: 36 },
      { x: 400, y: 424, w: 224, h: 36 },
    ],
    pits: [],
    bushes: [
      { x: 300, y: 76, w: 84, h: 64 },
      { x: 640, y: 76, w: 84, h: 64 },
      { x: 300, y: 500, w: 84, h: 64 },
      { x: 640, y: 500, w: 84, h: 64 },
    ],
    // a piston prowls the vault interior — grabbing vault loot is never free
    crushers: [{ x: 412, y: 292, w: 56, h: 56, dx: 146, dy: 0, period: 3.0, phase: 0 }],
    portals: [],
    // both vault doors are gated; each outer switch opens one side
    gates: [
      { x: 392, y: 216, w: 18, h: 208 },
      { x: 614, y: 216, w: 18, h: 208 },
    ],
    switches: [
      { x: 140, y: 320, r: 22, gate: 0 },
      { x: 884, y: 320, r: 22, gate: 1 },
    ],
    spawns: [
      { x: 95, y: 95 },
      { x: 929, y: 95 },
      { x: 95, y: 545 },
      { x: 929, y: 545 },
      { x: 512, y: 104 },
      { x: 512, y: 560 },
    ],
  },
];

/** The arena currently in play (live binding; reassigned by `setArena`). */
export let arena: Arena = ARENAS[0];
export let OBSTACLES: Rect[] = arena.obstacles;
export let SPAWNS: Spawn[] = arena.spawns;
export let PITS: Rect[] = arena.pits;
export let BUSHES: Rect[] = arena.bushes;
export let CRUSHERS: CrusherDef[] = arena.crushers;
export let PORTALS: Portal[] = arena.portals;
export let SWITCHES: SwitchDef[] = arena.switches;
export let GATES: GateDef[] = arena.gates;

/** Select the active arena by index, republishing the live bindings. */
export function setArena(i: number): void {
  arena = ARENAS[((i % ARENAS.length) + ARENAS.length) % ARENAS.length];
  OBSTACLES = arena.obstacles;
  SPAWNS = arena.spawns;
  PITS = arena.pits;
  BUSHES = arena.bushes;
  CRUSHERS = arena.crushers;
  PORTALS = arena.portals;
  SWITCHES = arena.switches;
  GATES = arena.gates;
}

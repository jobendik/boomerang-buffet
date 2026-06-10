/** Shared cross-module types. */

export type Vec2 = [number, number];

/** A cute-food fighter definition with its vector-art draw routine. */
export interface Char {
  name: string;
  body: string;
  dark: string;
  accent: string;
  draw: (c: Char, r: number, look: Vec2) => void;
}

/** A collectible power-up definition. */
export interface Power {
  name: string;
  color: string;
  /** One-line effect summary, surfaced in pickup toasts & the help glossary. */
  desc: string;
}

/** Axis-aligned rectangle used by the arena obstacles. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Spawn {
  x: number;
  y: number;
}

/**
 * A kinematic crushing block. It oscillates from its base `(x, y)` to
 * `(x + dx, y + dy)` and back every `period` seconds; a fighter pinned between
 * it and a wall/obstacle is squished (an environmental death, no killer).
 */
export interface CrusherDef {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number; // travel offset at full extension
  dy: number;
  period: number; // seconds for one full out-and-back cycle
  phase?: number; // 0..1 starting offset along the cycle
}

/** A linked teleporter pair: entities at node A are warped to node B and back. */
export interface Portal {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

/** A floor switch: standing on it opens the gate at index `gate` in `gates`. */
export interface SwitchDef {
  x: number;
  y: number;
  r: number;
  gate: number; // index into the arena's `gates` array
}

/** A gate: a solid block (like an obstacle) that retracts while its linked
 *  switch is pressed, opening a passage. */
export interface GateDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Visual family an arena belongs to — drives the themed renderer. */
export type Biome = 'diner' | 'rooftop' | 'neon' | 'grove' | 'ice';

/** A selectable arena: geometry, spawns, hazards and a colour theme. */
export interface Arena {
  name: string;
  tagline: string; // one-line flavour shown in the menu
  biome: Biome;
  obstacles: Rect[];
  spawns: Spawn[];
  pits: Rect[]; // bottomless — a grounded fighter standing in one falls out
  bushes: Rect[]; // leafy cover: hides a fighter from bots, feeds "Rambo"
  crushers: CrusherDef[]; // kinematic blocks that squish the careless
  portals: Portal[];
  switches: SwitchDef[]; // floor plates that open gates while pressed
  gates: GateDef[]; // solid blocks that retract when their switch is pressed
  floorA: string;
  floorB: string;
  accent: string;
  slick?: boolean; // icy footing: drifty acceleration & braking
}

/**
 * Per-frame movement/action intents. Produced by either human input
 * (`humanIntents`) or the AI (`aiThink`) and consumed by `Player.update`.
 */
export interface Intents {
  move: Vec2;
  aimX: number;
  aimY: number;
  throwNow?: boolean;
  throwHeld?: boolean;
  charge?: number;
  dash?: boolean;
  /** Melee slash — also clashes/parries incoming boomerangs (requires being armed). */
  slash?: boolean;
  /** Hop into the air — lifts you out of the collision radius to leap projectiles/foes. */
  jump?: boolean;
}

/** Result of a circle-vs-rectangle collision test. */
export interface CircleRectHit {
  hit: boolean;
  nx?: number;
  ny?: number;
  pen?: number;
  px?: number;
  py?: number;
}

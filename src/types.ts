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
  icon: string;
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

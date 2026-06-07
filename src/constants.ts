/** Game-wide constants: logical resolution and arena bounds. */

export const W = 1024; // logical width
export const H = 640; // logical height
export const WALL = 22; // border wall thickness

export const BOUNDS = {
  l: WALL,
  t: WALL,
  r: W - WALL,
  b: H - WALL,
} as const;

/** Melee slash geometry, shared by the Player (input/visuals) and collision. */
export const SLASH_RANGE = 26; // reach past the body radius
export const SLASH_HALF = 1.0; // half-arc (radians) in front of aim

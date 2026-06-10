import type { Power } from '../types';

/**
 * Stackable power-up modifiers (Boomerang Fu style). Unlike a single-slot
 * buff, a fighter accumulates a *set* of these that persist until death and
 * combine with one another. See `Player.applyPower` for stacking/exclusion
 * rules and the systems that read them.
 */

export const POWERS: Record<string, Power> = {
  FIRE: { name: 'Fire', color: '#ff7b3a', desc: 'Throws blaze a burning trail' },
  ICE: { name: 'Ice', color: '#8fe6ff', desc: 'Hits freeze foes solid' },
  BOMB: { name: 'Bomb', color: '#ffd23a', desc: 'Boomerang detonates on impact' },
  BIG: { name: 'Big', color: '#7ad0ff', desc: 'Huge, hard-to-dodge boomerang' },
  MULTI: { name: 'Multi', color: '#ff7ad0', desc: 'Splits into a fan mid-flight' },
  EXTRA: { name: 'Extra', color: '#c08bff', desc: 'Dual-wield + faster slashes' },
  SPEED: { name: 'Caffeine', color: '#a0ff6b', desc: 'Faster legs, near-instant dash' },
  SHIELD: { name: 'Shield', color: '#ffe08a', desc: 'Blocks the next lethal hit' },
  TELEPORT: { name: 'Warp', color: '#8affd6', desc: 'Dash teleports to your boomerang' },
  STAB: { name: 'Stab', color: '#ff8b5e', desc: 'Slash lunges you forward' },
  GHOST: { name: 'Last Laugh', color: '#c9b8ff', desc: 'Explode when you die' },
  UNSTOPPABLE: { name: 'Unstoppable', color: '#ff4d7a', desc: 'Throws cannot be parried' },
  HOTFEET: { name: 'Hot Feet', color: '#ff9a3a', desc: 'Scorch the ground as you run' },
  TELEKINESIS: { name: 'Telekinesis', color: '#9d7bff', desc: 'Hold throw to pilot the flight' },
  BAMBOOZLE: { name: 'Bamboozle', color: '#b06bff', desc: 'Controls inverted! Walk it off' },
  DISGUISE: { name: 'Disguise', color: '#9bd17a', desc: 'Stand still to become scenery' },
  COOLWALK: { name: 'Cool Walk', color: '#8fe6ff', desc: 'Leave a chilling ice trail' },
  WEAKARM: { name: 'Weak Arm', color: '#b0a0c0', desc: 'Throw range halved. Ouch' },
  DECOY: { name: 'Decoy', color: '#7ad0ff', desc: 'Dashing drops a body double' },
  DELAYED: { name: 'Delayed Death', color: '#c9b8ff', desc: '2s of borrowed time when slain' },
  PHASE: { name: 'Phase Dash', color: '#b6f0ff', desc: 'Dash straight through walls' },
  BATTLE: { name: 'Battle Royale', color: '#ff5d6c', desc: 'The arena closes in around you' },
};

export type PowerKey = keyof typeof POWERS;

export const POWER_KEYS = Object.keys(POWERS) as PowerKey[];

/**
 * Mutually-exclusive power groups — acquiring one member drops any others in
 * the same group. Fire/Ice are the elemental pair; Hot Feet/Cool Walk are the
 * trail pair (your footwear leaves one element, not both).
 */
export const EXCLUSIVE_GROUPS: PowerKey[][] = [
  ['FIRE', 'ICE'],
  ['HOTFEET', 'COOLWALK'],
];

/**
 * Anti-powerups (BAMBOOZLE inverts controls; WEAKARM halves throw range) are
 * never the first book spawned in a match, so a new player isn't immediately
 * punished by a mystery downgrade. BATTLE (Battle Royale) is held back too —
 * it's a match-warping global event, not something to drop on an empty arena.
 */
export const NEVER_FIRST: PowerKey[] = ['BAMBOOZLE', 'WEAKARM', 'BATTLE'];

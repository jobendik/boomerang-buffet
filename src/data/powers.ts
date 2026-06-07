import type { Power } from '../types';

/**
 * Stackable power-up modifiers (Boomerang Fu style). Unlike a single-slot
 * buff, a fighter accumulates a *set* of these that persist until death and
 * combine with one another. See `Player.applyPower` for stacking/exclusion
 * rules and the systems that read them.
 */

export const POWERS: Record<string, Power> = {
  FIRE: { name: 'Fire', color: '#ff7b3a', icon: '🔥' },
  ICE: { name: 'Ice', color: '#8fe6ff', icon: '❄' },
  BOMB: { name: 'Bomb', color: '#ffd23a', icon: '✸' },
  BIG: { name: 'Big', color: '#7ad0ff', icon: '◯' },
  MULTI: { name: 'Multi', color: '#ff7ad0', icon: '⋔' },
  EXTRA: { name: 'Extra', color: '#c08bff', icon: '✦' },
  SPEED: { name: 'Caffeine', color: '#a0ff6b', icon: '»' },
  SHIELD: { name: 'Shield', color: '#ffe08a', icon: '◈' },
  TELEPORT: { name: 'Warp', color: '#8affd6', icon: '➤' },
  STAB: { name: 'Stab', color: '#ff8b5e', icon: '➹' },
  GHOST: { name: 'Last Laugh', color: '#c9b8ff', icon: '☠' },
  UNSTOPPABLE: { name: 'Unstoppable', color: '#ff4d7a', icon: '●' },
  HOTFEET: { name: 'Hot Feet', color: '#ff9a3a', icon: '➳' },
  TELEKINESIS: { name: 'Telekinesis', color: '#9d7bff', icon: '◉' },
  BAMBOOZLE: { name: 'Bamboozle', color: '#b06bff', icon: '?' },
  DISGUISE: { name: 'Disguise', color: '#9bd17a', icon: '⌂' },
  COOLWALK: { name: 'Cool Walk', color: '#8fe6ff', icon: '❅' },
  WEAKARM: { name: 'Weak Arm', color: '#b0a0c0', icon: '↧' },
  DECOY: { name: 'Decoy', color: '#7ad0ff', icon: '⧉' },
  DELAYED: { name: 'Delayed Death', color: '#c9b8ff', icon: '⌛' },
  PHASE: { name: 'Phase Dash', color: '#b6f0ff', icon: '⇶' },
  BATTLE: { name: 'Battle Royale', color: '#ff5d6c', icon: '◎' },
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

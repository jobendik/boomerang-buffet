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
};

export type PowerKey = keyof typeof POWERS;

export const POWER_KEYS = Object.keys(POWERS) as PowerKey[];

/** Elemental powers are mutually exclusive — acquiring one removes the other. */
export const ELEMENTAL_EXCLUSIVE: PowerKey[] = ['FIRE', 'ICE'];

/**
 * BAMBOOZLE is an *anti*-powerup (inverts your controls). Per the source
 * design it is never the first book spawned in a match, so a new player is
 * not immediately punished by mystery controls.
 */
export const NEVER_FIRST: PowerKey[] = ['BAMBOOZLE'];

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
};

export type PowerKey = keyof typeof POWERS;

export const POWER_KEYS = Object.keys(POWERS) as PowerKey[];

/** Elemental powers are mutually exclusive — acquiring one removes the other. */
export const ELEMENTAL_EXCLUSIVE: PowerKey[] = ['FIRE', 'ICE'];

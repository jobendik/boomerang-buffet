import { game } from './state';
import type { Player } from '../entities/Player';

/**
 * Post-match telemetry awards — a nod to Boomerang Fu's comedic end screen.
 * Each award goes to the player with the highest qualifying stat value.
 */

export interface Award {
  title: string;
  player: Player;
  detail: string;
}

interface AwardDef {
  title: string;
  value: (p: Player) => number;
  threshold: number;
  detail: (v: number) => string;
}

const DEFS: AwardDef[] = [
  {
    title: 'Fastest Reflexes',
    value: (p) => p.stats.clashes,
    threshold: 1,
    detail: (v) => v + ' clashes',
  },
  {
    title: 'Most Frantic',
    value: (p) => p.stats.dashes,
    threshold: 10,
    detail: (v) => v + ' dashes',
  },
  {
    title: 'Cannon Fodder',
    value: (p) => p.stats.deaths,
    threshold: 1,
    detail: (v) => v + ' deaths',
  },
  {
    title: 'Most Unarmed',
    value: (p) => p.stats.unarmedTime,
    threshold: 15,
    detail: (v) => Math.round(v) + 's weaponless',
  },
  {
    title: 'Top Slicer',
    value: (p) => p.stats.kills,
    threshold: 1,
    detail: (v) => v + ' kills',
  },
  {
    title: 'Ice Breaker',
    value: (p) => p.stats.frozenKills,
    threshold: 1,
    detail: (v) => v + ' foes shattered',
  },
  {
    title: 'Pyromaniac',
    value: (p) => p.stats.burnKills,
    threshold: 1,
    detail: (v) => v + ' burned to a crisp',
  },
  {
    title: 'Short Fuse',
    value: (p) => p.stats.bombSelfKills,
    threshold: 1,
    detail: (v) => v + ' self-detonations',
  },
  {
    title: 'Drunken Master',
    value: (p) => p.stats.bamboozledKills,
    threshold: 1,
    detail: (v) => v + ' kills while dizzy',
  },
  {
    title: 'Most Bamboozled',
    value: (p) => p.stats.bamboozledTime,
    threshold: 6,
    detail: (v) => Math.round(v) + 's of chaos',
  },
  {
    title: 'Slow Learner',
    value: (p) => p.stats.falls,
    threshold: 2,
    detail: (v) => v + ' tumbles into the void',
  },
  {
    title: 'Rambo',
    value: (p) => p.stats.bushTime,
    threshold: 6,
    detail: (v) => Math.round(v) + 's lurking in the bushes',
  },
  {
    title: 'Trash Compactor',
    value: (p) => p.stats.crushDeaths,
    threshold: 1,
    detail: (v) => 'squished ' + v + (v === 1 ? ' time' : ' times'),
  },
  {
    title: 'Vengeful Ghost',
    value: (p) => p.stats.ghostKills,
    threshold: 1,
    detail: (v) => v + ' kills from beyond the grave',
  },
  {
    title: 'Most Enthusiastic',
    value: (p) => p.stats.distance,
    threshold: 500,
    detail: (v) => Math.round(v / 100) + 'm on the move',
  },
  {
    title: 'Switcheroo',
    value: (p) => p.stats.switches,
    threshold: 8,
    detail: (v) => v + ' switches flipped',
  },
];

export function computeAwards(): Award[] {
  const out: Award[] = [];
  for (const def of DEFS) {
    let best: Player | null = null;
    let bv = -Infinity;
    for (const p of game.players) {
      const v = def.value(p);
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (best && bv >= def.threshold) {
      out.push({ title: def.title, player: best, detail: def.detail(bv) });
    }
  }
  return out;
}

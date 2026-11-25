import { game } from './state';
import type { Player } from '../entities/Player';

/**
 * Post-match telemetry awards — the comedy roast on the podium screen. Each
 * award goes to the fighter with the highest qualifying stat; then a line-up
 * is picked that spreads the trophies around (everybody goes home with
 * something if they earned anything at all) and leads with the stories worth
 * retelling over the bookkeeping.
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
  /** How good a story it is: higher wins a place in the line-up first. */
  w: number;
}

const s = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;

const DEFS: AwardDef[] = [
  // the highlight reel
  { title: 'Trick Shot Artist', value: (p) => p.stats.style, threshold: 5, detail: (v) => v + ' style points', w: 10 },
  { title: 'Hot Potato', value: (p) => p.stats.bestRally, threshold: 3, detail: (v) => `kept a ${v}-hit rally alive`, w: 10 },
  { title: 'Return to Sender', value: (p) => p.stats.rallyKills, threshold: 1, detail: (v) => s(v, 'kill') + ' with a parried throw', w: 9 },
  { title: 'Sumo Champion', value: (p) => p.stats.ringOuts, threshold: 1, detail: (v) => s(v, 'ring-out'), w: 9 },
  { title: 'Poltergeist', value: (p) => p.stats.ghostKills, threshold: 1, detail: (v) => s(v, 'kill') + ' from beyond the grave', w: 9 },
  { title: 'Cliffhanger', value: (p) => p.stats.recoveries, threshold: 1, detail: (v) => s(v, 'save') + " at the pit's edge", w: 8 },
  { title: 'Pacifist', value: (p) => p.stats.pacifistWins, threshold: 1, detail: (v) => `won ${s(v, 'round')} without a single KO`, w: 8 },
  { title: 'Drunken Master', value: (p) => p.stats.bamboozledKills, threshold: 1, detail: (v) => s(v, 'kill') + ' while dizzy', w: 8 },
  { title: 'En Garde', value: (p) => p.stats.slashClashes, threshold: 1, detail: (v) => s(v, 'blade clash', 'blade clashes'), w: 7 },
  { title: 'Ice Breaker', value: (p) => p.stats.frozenKills, threshold: 1, detail: (v) => s(v, 'foe') + ' shattered', w: 7 },
  { title: 'Pyromaniac', value: (p) => p.stats.burnKills, threshold: 1, detail: (v) => v + ' burned to a crisp', w: 7 },
  // the blooper reel
  { title: 'Short Fuse', value: (p) => p.stats.bombSelfKills, threshold: 1, detail: (v) => s(v, 'self-detonation'), w: 8 },
  { title: 'Own Worst Enemy', value: (p) => p.stats.selfKills, threshold: 2, detail: (v) => v + ' deaths with nobody else to blame', w: 7 },
  { title: 'Slow Learner', value: (p) => p.stats.falls, threshold: 2, detail: (v) => v + ' tumbles into the void', w: 7 },
  { title: 'Trash Compactor', value: (p) => p.stats.crushDeaths, threshold: 1, detail: (v) => 'squished ' + s(v, 'time'), w: 7 },
  { title: 'Most Bamboozled', value: (p) => p.stats.bamboozledTime, threshold: 6, detail: (v) => Math.round(v) + 's of chaos', w: 5 },
  // character sketches
  { title: 'Teflon', value: (p) => p.stats.closeCalls, threshold: 8, detail: (v) => v + ' throws missed by a whisker', w: 6 },
  { title: 'Bumper Car', value: (p) => p.stats.shoves, threshold: 4, detail: (v) => v + ' tackles landed', w: 6 },
  { title: 'Fastest Reflexes', value: (p) => p.stats.clashes, threshold: 2, detail: (v) => v + ' parries', w: 6 },
  { title: 'Air Traffic Control', value: (p) => p.stats.boomClashes, threshold: 5, detail: (v) => v + ' mid-air collisions', w: 4 },
  { title: 'Haunted House', value: (p) => p.stats.haunts, threshold: 4, detail: (v) => v + ' ghostly gusts', w: 5 },
  { title: 'Rambo', value: (p) => p.stats.bushTime, threshold: 6, detail: (v) => Math.round(v) + 's lurking in the bushes', w: 5 },
  { title: 'Switcheroo', value: (p) => p.stats.switches, threshold: 8, detail: (v) => v + ' switches flipped', w: 3 },
  { title: 'Top Slicer', value: (p) => p.stats.kills, threshold: 1, detail: (v) => s(v, 'KO'), w: 5 },
  // consolation prizes
  { title: 'Most Unarmed', value: (p) => p.stats.unarmedTime, threshold: 15, detail: (v) => Math.round(v) + 's weaponless', w: 2 },
  { title: 'Most Frantic', value: (p) => p.stats.dashes, threshold: 10, detail: (v) => v + ' dashes', w: 2 },
  { title: 'Most Enthusiastic', value: (p) => p.stats.distance, threshold: 500, detail: (v) => Math.round(v / 100) + 'm on the move', w: 1 },
  { title: 'Cannon Fodder', value: (p) => p.stats.deaths, threshold: 1, detail: (v) => s(v, 'death'), w: 2 },
];

/** Every award anyone qualified for, best stories first. */
export function allAwards(): (Award & { w: number })[] {
  const out: (Award & { w: number })[] = [];
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
    if (best && bv >= def.threshold) out.push({ title: def.title, player: best, detail: def.detail(bv), w: def.w });
  }
  return out.sort((a, b) => b.w - a.w);
}

/**
 * The podium line-up: up to `max` awards. First everyone's single best
 * story, then the best of what's left — capped per fighter so one snack
 * can't hog the whole ceremony. Nobody leaves empty-handed: a fighter who
 * topped no chart is handed an unclaimed award they at least qualified for,
 * and failing even that, the Participation Trophy.
 */
export function computeAwards(max = 8): Award[] {
  const all = allAwards();
  const picked: (Award & { w: number })[] = [];
  const count = new Map<Player, number>();
  for (const p of game.players) {
    let a = all.find((x) => x.player === p);
    if (!a) {
      // consolation: the best award they qualify for that nobody else took
      const def = DEFS.filter((d) => d.value(p) >= d.threshold && !all.some((x) => x.title === d.title)).sort((x, y) => y.w - x.w)[0];
      a = def ? { title: def.title, player: p, detail: def.detail(def.value(p)), w: def.w - 1 } : { title: 'Participation Trophy', player: p, detail: 'showed up · mostly', w: 0 };
    }
    picked.push(a);
    count.set(p, 1);
  }
  const cap = Math.max(2, Math.ceil(max / Math.max(1, game.players.length)) + 1);
  for (const a of all) {
    if (picked.length >= max) break;
    if (picked.includes(a) || (count.get(a.player) ?? 0) >= cap) continue;
    picked.push(a);
    count.set(a.player, (count.get(a.player) ?? 0) + 1);
  }
  return picked.sort((a, b) => b.w - a.w).slice(0, max);
}

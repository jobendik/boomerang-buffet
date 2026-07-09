/**
 * Headless match simulator: drives the REAL game loop (`update`) at a fixed
 * 60Hz timestep with rendering stubbed out, so whole matches run in
 * milliseconds. This is the instrument for tuning the AI programmatically —
 * measure lethality, round pacing, aggro spread and evasion counterplay per
 * difficulty instead of eyeballing them.
 *
 * The sim is intentionally nondeterministic (the game rolls Math.random
 * everywhere), so consumers should aggregate over several runs and compare
 * medians/means with sane margins.
 */

import { game } from '../src/game/state';
import { startMatch } from '../src/game/flow';
import { update } from '../src/game/update';
import { keys, mouse } from '../src/core/input';
import { Player } from '../src/entities/Player';

export interface MatchOpts {
  difficulty: 0 | 1 | 2;
  numPlayers?: number; // default 4
  target?: number; // score to win the match (default 3)
  arena?: number; // fixed arena index for comparability (default 0), -1 = random
  allAI?: boolean; // default true: flip slot 0 to a bot so the match is bots-only
  maxSimSeconds?: number; // safety valve (default 900 simulated seconds)
  /** Per-frame hook to script the human proxy (slot 0) via `keys`/`mouse`. */
  perFrame?: (t: number, players: Player[]) => void;
}

export interface MatchStats {
  simSeconds: number; // total simulated time until matchover (or timeout)
  rounds: number;
  roundLengths: number[]; // seconds of 'playing' per completed round
  suddenRounds: number; // rounds that hit the sudden-death fire
  kills: number[]; // per player slot, match-cumulative
  deaths: number[];
  winnerSlot: number | null;
  timedOut: boolean;
}

const DT = 1 / 60;

function resetSharedState(): void {
  for (const k of Object.keys(keys)) delete keys[k];
  mouse.down = false;
  mouse.rdown = false;
  mouse.x = 512;
  mouse.y = 320;
  game.paused = false;
  game.slowmo = 0;
  game.hitstop = 0;
  game.shake = 0;
  game.decals = [];
  game.toasts = [];
  game.mode = 0; // free-for-all: the balance-relevant mode
  game.numHumans = 1;
  game.controlSchemes = [0, 1, 2, 3];
  game.fallProtect = 1;
}

export function runMatch(opts: MatchOpts): MatchStats {
  resetSharedState();
  game.difficulty = opts.difficulty;
  game.numPlayers = opts.numPlayers ?? 4;
  game.target = opts.target ?? 3;
  game.arenaSel = opts.arena ?? 0;
  startMatch();
  if (opts.allAI !== false) for (const p of game.players) p.isAI = true;

  const maxT = opts.maxSimSeconds ?? 900;
  const roundLengths: number[] = [];
  let suddenRounds = 0;
  let prevSudden = false;
  let t = 0;
  while (game.state !== 'matchover' && t < maxT) {
    opts.perFrame?.(t, game.players);
    const wasPlaying = game.state === 'playing';
    const roundT = game.roundT;
    update(DT);
    t += DT;
    if (wasPlaying && game.state !== 'playing' && game.state !== 'countdown') roundLengths.push(roundT);
    if (game.sudden && !prevSudden) suddenRounds++;
    prevSudden = game.sudden;
  }

  return {
    simSeconds: t,
    rounds: roundLengths.length,
    roundLengths,
    suddenRounds,
    kills: game.players.map((p) => p.stats.kills),
    deaths: game.players.map((p) => p.stats.deaths),
    winnerSlot: game.matchWinner ? game.players.indexOf(game.matchWinner) : null,
    timedOut: t >= maxT,
  };
}

export interface SurvivalResult {
  seconds: number; // how long the slot-0 proxy lasted in round 1
  survived: boolean; // true if the round ended with the proxy still alive
}

/**
 * One single-round match measuring how long the slot-0 "human proxy" lasts
 * against the bots. Pass a `script` to drive the proxy (dodge, kite, …);
 * without one it stands perfectly still — the baseline victim.
 */
export function runSurvival(difficulty: 0 | 1 | 2, script?: (t: number, players: Player[]) => void, arena = 0): SurvivalResult {
  let died = -1;
  const stats = runMatch({
    difficulty,
    target: 1,
    arena,
    allAI: false,
    maxSimSeconds: 120,
    perFrame: (t, players) => {
      if (died < 0 && !players[0].alive) died = t;
      script?.(t, players);
    },
  });
  if (died >= 0) return { seconds: died, survived: false };
  return { seconds: stats.simSeconds, survived: true };
}

/** Scripted proxy: run a wide circle (direction flips keep bots guessing). */
export function circlingEvader(t: number): void {
  const w = 1.4; // rad/s of the movement direction
  const a = t * w + (Math.floor(t / 4) % 2 ? Math.PI : 0); // flip every 4s
  setMoveKeys(Math.cos(a), Math.sin(a), Math.floor(t * 60) % 90 === 0);
}

/**
 * Scripted proxy modelling the complained-about play: walk straight at the
 * nearest bot and slash it. Dashes to close the last stretch, holds the slash
 * key in reach. Measures whether going for the slice is a viable move or a
 * death sentence.
 */
export function meleeRusher(_t: number, players: Player[]): void {
  const me = players[0];
  if (!me.alive) {
    setMoveKeys(0, 0, false);
    keys['KeyE'] = false;
    return;
  }
  let foe: Player | null = null;
  let fd = 1e9;
  for (const q of players) {
    if (q === me || !q.alive) continue;
    const d = Math.hypot(q.x - me.x, q.y - me.y);
    if (d < fd) {
      fd = d;
      foe = q;
    }
  }
  if (!foe) {
    setMoveKeys(0, 0, false);
    keys['KeyE'] = false;
    return;
  }
  mouse.x = foe.x; // aim straight at the mark
  mouse.y = foe.y;
  // the real-player tech: dash carries all the way into contact (i-frames
  // covering the last, deadliest stretch), slashing the moment the blade
  // can connect — not a naive stroll through the point-blank zone
  const dash = fd < 240 && fd > 55 && me.dashCd <= 0 && me.armed;
  setMoveKeys(foe.x - me.x, foe.y - me.y, dash);
  keys['KeyE'] = fd < 72 && me.armed;
}

export interface RusherResult {
  kills: number; // slices landed by the rusher before the round ended
  seconds: number; // how long the rusher stayed alive
  survived: boolean;
}

/**
 * One single-round 1v1: the slot-0 proxy melee-rushes a single bot. Isolating
 * the duel (no teammate crossfire) is what makes this a low-variance read on
 * "is walking up for the slice a fair play or a death sentence".
 */
export function runRusher(difficulty: 0 | 1 | 2, arena = 0): RusherResult {
  let died = -1;
  let kills = 0;
  const stats = runMatch({
    difficulty,
    numPlayers: 2,
    target: 1,
    arena,
    allAI: false,
    maxSimSeconds: 120,
    perFrame: (t, players) => {
      if (died < 0 && !players[0].alive) died = t;
      kills = players[0].stats.kills;
      meleeRusher(t, players);
    },
  });
  return { kills, seconds: died >= 0 ? died : stats.simSeconds, survived: died < 0 };
}

export interface SpectateResult {
  spectateSeconds: number; // human death → round resolution (incl. roundover pause)
  humanDied: boolean;
}

/**
 * The boredom metric: an idle slot-0 human dies early, then we clock how long
 * the surviving bots take to settle the round while the player just watches.
 */
export function runSpectate(difficulty: 0 | 1 | 2, arena = 0): SpectateResult {
  let died = -1;
  const stats = runMatch({
    difficulty,
    target: 1,
    arena,
    allAI: false,
    maxSimSeconds: 180,
    perFrame: (t, players) => {
      if (died < 0 && !players[0].alive) died = t;
    },
  });
  if (died < 0) return { spectateSeconds: 0, humanDied: false };
  return { spectateSeconds: stats.simSeconds - died, humanDied: true };
}

/**
 * Scripted proxy modelling a competent human's defence: sidestep
 * perpendicular to incoming boomerangs (dashing through the close ones for
 * i-frames), and kite away from bots that get too close. No offence — it
 * measures pure survivability, i.e. whether the difficulty tier can be
 * outplayed by movement skill.
 */
export function reactiveDodger(_t: number, players: Player[]): void {
  const me = players[0];
  if (!me.alive) {
    setMoveKeys(0, 0, false);
    return;
  }
  // nearest boomerang approaching me
  let threat: { vx: number; vy: number } | null = null;
  let td = 1e9;
  for (const b of game.boomerangs) {
    if (b.dead || !b.origOwner.isEnemy(me)) continue;
    const d = Math.hypot(b.x - me.x, b.y - me.y) || 1;
    const approaching = (b.vx * (me.x - b.x) + b.vy * (me.y - b.y)) / d / (Math.hypot(b.vx, b.vy) || 1);
    if (approaching > 0.3 && d < 280 && d < td) {
      td = d;
      threat = b;
    }
  }
  if (threat) {
    // sidestep perpendicular to the flight path, toward the arena's middle
    const n = Math.hypot(threat.vx, threat.vy) || 1;
    let px = -threat.vy / n;
    let py = threat.vx / n;
    if ((512 - me.x) * px + (320 - me.y) * py < 0) {
      px = -px;
      py = -py;
    }
    setMoveKeys(px, py, td < 110 && me.dashCd <= 0);
    return;
  }
  // no throw incoming: keep distance from the nearest bot
  let foe: Player | null = null;
  let fd = 1e9;
  for (const q of players) {
    if (q === me || !q.alive) continue;
    const d = Math.hypot(q.x - me.x, q.y - me.y);
    if (d < fd) {
      fd = d;
      foe = q;
    }
  }
  if (foe && fd < 260) {
    // flee, biased toward the centre so we don't pin ourselves on a wall
    const ax = me.x - foe.x + (512 - me.x) * 0.4;
    const ay = me.y - foe.y + (320 - me.y) * 0.4;
    setMoveKeys(ax, ay, fd < 70 && me.dashCd <= 0);
  } else {
    setMoveKeys(0, 0, false);
  }
}

function setMoveKeys(dx: number, dy: number, dash: boolean): void {
  const n = Math.hypot(dx, dy);
  const x = n ? dx / n : 0;
  const y = n ? dy / n : 0;
  keys['ArrowRight'] = x > 0.3;
  keys['ArrowLeft'] = x < -0.3;
  keys['ArrowDown'] = y > 0.3;
  keys['ArrowUp'] = y < -0.3;
  keys['Space'] = dash;
}

/* ------------------------------ statistics -------------------------------- */

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Share of all kills taken by the single most lethal player (0..1). */
export function killConcentration(kills: number[]): number {
  const total = kills.reduce((a, b) => a + b, 0);
  return total ? Math.max(...kills) / total : 0;
}

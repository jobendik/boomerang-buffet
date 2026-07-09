import { audio } from '../core/audio';
import { dist, rand, randi } from '../core/math';
import { BOUNDS } from '../constants';
import { ARENAS, OBSTACLES, PITS, SPAWNS, CRUSHERS, SWITCHES, GATES, setArena } from '../data/arena';
import { POWER_KEYS, NEVER_FIRST } from '../data/powers';
import { CHARS } from '../data/characters';
import { Player } from '../entities/Player';
import { Pickup } from '../entities/Pickup';
import { Crusher } from '../entities/Crusher';
import { game } from './state';

/** Match / round lifecycle and power-up spawning. */

function buildPlayers(): void {
  game.players = [];
  // shuffle the roster, then pull each human's explicitly picked fighter (if
  // any) out of the pool so it isn't handed to someone else too
  const idxs = CHARS.map((_, i) => i).sort(() => Math.random() - 0.5);
  const picks: (number | null)[] = [];
  for (let i = 0; i < game.numPlayers; i++) {
    const pick = i < game.numHumans ? game.charSel[i] : -1;
    if (pick >= 0 && pick < CHARS.length && idxs.includes(pick)) {
      idxs.splice(idxs.indexOf(pick), 1);
      picks.push(pick);
    } else {
      picks.push(null);
    }
  }
  // idxs always has enough elements here: CHARS.length (12) >= numPlayers (max 6),
  // and each entry in `picks` that consumed an idx was already spliced out above.
  const charOrder = picks.map((pick) => (pick !== null ? pick : idxs.shift()!));
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  for (let i = 0; i < game.numPlayers; i++) {
    const p = new Player(charOrder[i], spawnsOrder[i], i >= game.numHumans);
    // Team Up: split the lobby into two squads (you always lead team 0)
    p.team = game.mode === 1 ? i % 2 : -1;
    game.players.push(p);
  }
}

export function startMatch(): void {
  buildPlayers();
  game.roundNum = 0;
  game.matchWinner = null;
  game.roundWinner = null;
  game.pickupsSpawned = 0;
  game.golden = null;
  // Golden mode: scale the hold time up for smaller lobbies so it stays tense
  game.goldTarget = game.numPlayers <= 3 ? 18 : 14;
  for (const p of game.players) {
    p.score = 0;
    p.goldTime = 0;
  }
  startRound();
}

export function startRound(): void {
  game.roundNum++;
  // pick the arena (random each round, or the fixed selection) BEFORE spawning,
  // so spawns/pits/portals all come from the right layout
  setArena(game.arenaSel < 0 ? randi(0, ARENAS.length - 1) : game.arenaSel);
  game.boomerangs = [];
  game.pickups = [];
  game.particles = [];
  game.hazards = [];
  game.decoys = [];
  game.crushers = CRUSHERS.map((d) => new Crusher(d));
  // fresh floor-switch / gate runtime for this arena (gates start closed)
  game.switches = SWITCHES.map((s) => ({ x: s.x, y: s.y, r: s.r, gate: s.gate, pressed: false, on: [] }));
  game.gates = GATES.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h, open: false }));
  // Weather: a 5% chance of rain, but only on maps with no bottomless pits
  // (slick footing + a yawning void would be a touch too cruel).
  game.raining = PITS.length === 0 && Math.random() < 0.05;
  const spawnsOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
  game.players.forEach((p, i) => {
    p.reset(SPAWNS[spawnsOrder[i]]);
    p.invuln = 0.8;
    // opening grace: stagger the bots' first throws (easier tiers wait longer),
    // so "FIGHT!" isn't answered by an instant synchronized volley
    p.ai.tThrow = rand(0.5, 1.2) + (2 - game.difficulty) * 0.35;
  });
  game.br = null; // any Battle Royale event ends with the round
  game.roundT = 0; // fresh clock for the sudden-death stall-breaker
  game.hurry = false;
  game.sudden = false;
  game.suddenEnc = 0;
  game.flash = 0;
  // Golden Boomerang resets to centre each round; carried time is cumulative
  if (game.mode === 2) {
    game.golden = { x: (BOUNDS.l + BOUNDS.r) / 2, y: (BOUNDS.t + BOUNDS.b) / 2, carrier: null, bob: 0 };
  } else {
    game.golden = null;
  }
  setupHideSeek();
  game.pickupTimer = 3.5;
  game.state = 'countdown';
  game.countdownT = 2.2;
  audio.music('game');
  audio.respawn(); // the whole roster popping back onto the field
}

/**
 * Hide & Seek round setup: the human (player 0) is the seeker, everyone else a
 * hider. Hiders are stripped of weapons and will melt into props once the
 * seeker-blind setup window closes; the seeker gets a finite pool of attempts.
 * Inert decoy props are scattered so the seeker can't just swat every prop.
 */
function setupHideSeek(): void {
  game.hsDecoys = [];
  if (game.mode !== 3) {
    game.hsSetup = 0;
    game.hsTimer = 0;
    return;
  }
  const hiders = game.numPlayers - 1;
  game.players.forEach((p) => {
    p.role = p.idx === 0 ? 'seeker' : 'hider';
    if (p.role === 'hider') {
      p.boomsInHand = 0;
      p.boomsMax = 0;
      p.respawns = [];
    } else {
      p.attemptsLeft = hiders * 2 + 2; // refunded on a hit, so misses are what bite
    }
  });
  game.hsSetup = 10; // seeker blinded while hiders scurry into position
  game.hsTimer = 40; // hunt time once setup ends; elapse → hiders win
  // scatter lookalike decoys at free spots
  const want = hiders + 5;
  for (let n = 0; n < want; n++) {
    for (let tries = 0; tries < 25; tries++) {
      const x = rand(BOUNDS.l + 60, BOUNDS.r - 60);
      const y = rand(BOUNDS.t + 60, BOUNDS.b - 60);
      let ok = true;
      for (const R of OBSTACLES) if (x > R.x - 34 && x < R.x + R.w + 34 && y > R.y - 34 && y < R.y + R.h + 34) ok = false;
      for (const P of PITS) if (x > P.x - 34 && x < P.x + P.w + 34 && y > P.y - 34 && y < P.y + P.h + 34) ok = false;
      for (const d of game.hsDecoys) if (dist(x, y, d.x, d.y) < 70) ok = false;
      if (ok) {
        game.hsDecoys.push({ x, y, propIdx: randi(0, 2) });
        break;
      }
    }
  }
}

export function endRoundCheck(): void {
  const alive = game.players.filter((p) => p.alive);

  // Golden Boomerang: the match is won by holding time (handled in update), so
  // a round only ends when the field is cleared — then we simply re-rack.
  if (game.mode === 2) {
    if (alive.length <= 1 && !game.matchWinner) {
      game.roundWinner = alive[0] ?? null;
      game.state = 'roundover';
      game.roundoverT = 1.4;
    }
    return;
  }

  // Hide & Seek: the seeker wins by clearing every hider before time runs out;
  // the hiders win if the clock expires (or the seeker somehow perishes).
  if (game.mode === 3) {
    const seeker = game.players.find((p) => p.role === 'seeker');
    const hiders = game.players.filter((p) => p.role === 'hider' && p.alive);
    const seekerWon = !!seeker && seeker.alive && hiders.length === 0;
    const hidersWon = !seeker || !seeker.alive || game.hsTimer <= 0;
    if (!seekerWon && !hidersWon) return;
    if (seekerWon && seeker) {
      seeker.score++;
      game.roundWinner = seeker;
    } else {
      for (const h of hiders) h.score++; // every survivor banks the round
      game.roundWinner = hiders[0] ?? null;
    }
    game.state = 'roundover';
    game.roundoverT = 2.0;
    audio.roundWin();
    const champ = game.players.find((p) => p.score >= game.target);
    if (champ) game.matchWinner = champ;
    return;
  }

  // Team Up: the round ends once only one squad has members left standing.
  if (game.mode === 1) {
    const teams = new Set(alive.map((p) => p.team));
    if (teams.size <= 1) {
      game.roundWinner = alive[0] ?? null;
      for (const p of alive) p.score++; // whole surviving squad scores
      game.state = 'roundover';
      game.roundoverT = 2.0;
      if (game.roundWinner) audio.roundWin();
      const champ = game.players.find((p) => p.score >= game.target);
      if (champ) game.matchWinner = champ;
    }
    return;
  }

  // Free-for-all: last snack standing.
  if (alive.length <= 1) {
    game.roundWinner = alive.length === 1 ? alive[0] : null;
    if (game.roundWinner) game.roundWinner.score++;
    game.state = 'roundover';
    game.roundoverT = 2.0;
    if (game.roundWinner) audio.roundWin();
    const champ = game.players.find((p) => p.score >= game.target);
    if (champ) game.matchWinner = champ;
  }
}

/**
 * Dynamic economy: the more powers the most-buffed player holds, the less
 * likely a new power book spawns — discouraging snowballing (each held power
 * cuts the spawn chance by ~20%, per the original design).
 */
export function pickupSpawnChance(): number {
  let max = 0;
  for (const p of game.players) max = Math.max(max, p.powers.size);
  return Math.pow(0.8, max);
}

export function spawnPickup(): void {
  // some books (e.g. the BAMBOOZLE anti-power) are barred from being the very
  // first of a match, so a fresh player isn't blindsided by mystery controls
  const pool = game.pickupsSpawned === 0 ? POWER_KEYS.filter((k) => !NEVER_FIRST.includes(k)) : POWER_KEYS;
  const type = pool[randi(0, pool.length - 1)];
  // find free location — clear of solids, pits, gate slots, crusher sweeps,
  // fighters and other books (a book may still land inside a gated vault:
  // that's deliberate treasure, someone has to work the switch for it)
  for (let tries = 0; tries < 30; tries++) {
    const x = rand(BOUNDS.l + 50, BOUNDS.r - 50);
    const y = rand(BOUNDS.t + 50, BOUNDS.b - 50);
    let ok = true;
    for (const R of OBSTACLES) {
      if (x > R.x - 30 && x < R.x + R.w + 30 && y > R.y - 30 && y < R.y + R.h + 30) ok = false;
    }
    for (const P of PITS) {
      if (x > P.x - 30 && x < P.x + P.w + 30 && y > P.y - 30 && y < P.y + P.h + 30) ok = false;
    }
    for (const G of GATES) {
      if (x > G.x - 26 && x < G.x + G.w + 26 && y > G.y - 26 && y < G.y + G.h + 26) ok = false;
    }
    for (const C of CRUSHERS) {
      const x0 = Math.min(C.x, C.x + C.dx) - 24;
      const y0 = Math.min(C.y, C.y + C.dy) - 24;
      const x1 = Math.max(C.x + C.w, C.x + C.dx + C.w) + 24;
      const y1 = Math.max(C.y + C.h, C.y + C.dy + C.h) + 24;
      if (x > x0 && x < x1 && y > y0 && y < y1) ok = false;
    }
    for (const p of game.players) if (p.alive && dist(x, y, p.x, p.y) < 90) ok = false;
    for (const pk of game.pickups) if (dist(x, y, pk.x, pk.y) < 80) ok = false;
    if (ok) {
      game.pickups.push(new Pickup(x, y, type));
      game.pickupsSpawned++;
      return;
    }
  }
}

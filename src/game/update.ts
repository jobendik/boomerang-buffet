import { audio } from '../core/audio';
import { W } from '../constants';
import { dist, lerp, norm, rand, TAU } from '../core/math';
import { keys, mouse, readGamepad } from '../core/input';
import { aiThink } from '../systems/ai';
import { resolveBoomerangHits, resolveDecoyHits, resolvePlayerCollisions, resolveSlashes, spreadFire, updateSwitches } from '../systems/collision';
import { spawnConfetti, spawnRing } from '../systems/effects';
import { POWERS } from '../data/powers';
import { Particle } from '../entities/Particle';
import { game } from './state';
import { endRoundCheck, pickupSpawnChance, spawnPickup, startRound } from './flow';
import type { Intents, Vec2 } from '../types';
import type { Player } from '../entities/Player';

/** Battle Royale: shrink the safe circle and purge hostiles caught outside. */
function updateBattleRoyale(dt: number): void {
  const br = game.br;
  if (!br) return;
  br.t += dt;
  // ease the radius from rStart down to rMin over `shrink` seconds, then hold
  const k = Math.min(1, br.t / br.shrink);
  br.r = lerp(br.rStart, br.rMin, k);
  // anyone hostile to the initiator left outside the ring is eliminated
  // (environmental: credits the initiator but bypasses the Delayed-Death stay)
  for (const p of game.players) {
    if (!p.alive || p.invuln > 0 || !br.initiator.isEnemy(p)) continue;
    if (dist(p.x, p.y, br.cx, br.cy) > br.r + p.r) {
      const [dx, dy] = norm(p.x - br.cx, p.y - br.cy);
      p.die(br.initiator, dx, dy, true);
    }
  }
  // embers licking along the closing boundary (only once the ring is on-screen)
  if (br.r < 720 && Math.random() < 0.7) {
    const a = rand(0, TAU);
    game.particles.push(
      new Particle(br.cx + Math.cos(a) * br.r, br.cy + Math.sin(a) * br.r, rand(-10, 10), rand(-30, -6), rand(0.3, 0.6), Math.random() < 0.5 ? '#ff5d6c' : '#ffce54', rand(2, 4))
    );
  }
  if (br.t >= br.dur) {
    spawnRing(br.cx, br.cy, POWERS.BATTLE.color, 2.2);
    game.br = null;
  }
}

/** Golden Boomerang objective: pick-up-by-touch, accumulate hold time, win. */
function updateGolden(dt: number): void {
  const g = game.golden;
  if (!g) return;
  g.bob += dt;
  const carrier = g.carrier;
  if (carrier && carrier.alive) {
    g.x = carrier.x;
    g.y = carrier.y - carrier.r - 12;
    carrier.goldTime += dt;
    if (carrier.goldTime >= game.goldTarget) {
      game.matchWinner = carrier;
      game.roundWinner = carrier;
      game.state = 'roundover';
      game.roundoverT = 2.2;
      audio.win();
    }
    return;
  }
  // unheld: the first living fighter to touch it becomes the new carrier
  g.carrier = null;
  for (const p of game.players) {
    if (p.alive && dist(p.x, p.y, g.x, g.y) < p.r + 16) {
      g.carrier = p;
      spawnRing(p.x, p.y, '#ffd23a', 1.3);
      audio.power();
      break;
    }
  }
}

/** Per-frame simulation step and human input translation. */

/** P1: mouse aim/throw + arrow keys (also WASD, when solo — freed up for P2's
 *  ASDW scheme once local multiplayer is active). */
function mouseIntents(p: Player): Intents {
  let mx = 0;
  let my = 0;
  const soloWASD = game.numHumans <= 1; // WASD only doubles as P1's move keys in single-human play
  if (keys['ArrowUp'] || (soloWASD && keys['KeyW'])) my -= 1;
  if (keys['ArrowDown'] || (soloWASD && keys['KeyS'])) my += 1;
  if (keys['ArrowLeft'] || (soloWASD && keys['KeyA'])) mx -= 1;
  if (keys['ArrowRight'] || (soloWASD && keys['KeyD'])) mx += 1;
  const aim = norm(mouse.x - p.x, mouse.y - p.y);
  return {
    move: [mx, my],
    aimX: aim[0],
    aimY: aim[1],
    throwHeld: mouse.down,
    dash: keys['Space'],
    slash: mouse.rdown || keys['KeyE'],
    jump: keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyF'],
  };
}

interface KeyScheme {
  up: string;
  down: string;
  left: string;
  right: string;
  throwKey: string;
  slash: string;
  dash: string;
  jump: string;
}

/** P2: the WASD keys — the classic move set, freed from P1 once a second
 *  local human joins — plus a Z/X/C/V action cluster. */
const WASD_SCHEME: KeyScheme = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'KeyZ', slash: 'KeyX', dash: 'KeyC', throwKey: 'KeyV' };

/** P3: the IJKL keys — same diamond shape as WASD, shifted onto the right
 *  hand — plus a U/O/N/comma action cluster. */
const IJKL_SCHEME: KeyScheme = { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', jump: 'KeyN', slash: 'KeyO', dash: 'KeyU', throwKey: 'Comma' };

/** No mouse for these local players — aim follows the last move direction
 *  (or stays put, facing the way they last moved, while stationary). */
function keyboardIntents(p: Player, s: KeyScheme): Intents {
  let mx = 0;
  let my = 0;
  if (keys[s.up]) my -= 1;
  if (keys[s.down]) my += 1;
  if (keys[s.left]) mx -= 1;
  if (keys[s.right]) mx += 1;
  const aim: Vec2 = mx || my ? norm(mx, my) : p.aim;
  return {
    move: [mx, my],
    aimX: aim[0],
    aimY: aim[1],
    throwHeld: keys[s.throwKey],
    dash: keys[s.dash],
    slash: keys[s.slash],
    jump: keys[s.jump],
  };
}

/** P4 (and beyond): a connected gamepad — left stick to move, right stick to
 *  aim (falling back to facing the move direction if the pad has no right
 *  stick pushed), face buttons for throw/slash/dash/jump. Works with any
 *  standard-mapping controller, including the PS5 DualSense. */
function gamepadIntents(p: Player, padIndex: number): Intents {
  const pad = readGamepad(padIndex);
  if (!pad) return { move: [0, 0], aimX: p.aim[0], aimY: p.aim[1] };
  const [mx, my] = pad.move;
  const aim: Vec2 = pad.aim ? norm(pad.aim[0], pad.aim[1]) : mx || my ? norm(mx, my) : p.aim;
  return {
    move: [mx, my],
    aimX: aim[0],
    aimY: aim[1],
    throwHeld: pad.throwHeld,
    dash: pad.dash,
    slash: pad.slash,
    jump: pad.jump,
  };
}

/** Dispatch a local player's slot (its index within `game.players`, since
 *  humans always occupy the first `numHumans` slots) to its control scheme:
 *  0 = mouse+keys, 1 = ASDW, 2 = JLKI, 3+ = gamepad. */
function humanIntents(p: Player, slot: number): Intents {
  switch (slot) {
    case 0:
      return mouseIntents(p);
    case 1:
      return keyboardIntents(p, WASD_SCHEME);
    case 2:
      return keyboardIntents(p, IJKL_SCHEME);
    default:
      return gamepadIntents(p, slot - 3);
  }
}

export function update(dt: number): void {
  // Esc pause: hold the whole sim (render keeps presenting the frozen frame)
  if (game.paused) return;

  const raw = dt;
  // cinematic slow-mo (round-deciding kills): the timer burns in real time
  // while everything below — including particles & visuals — runs at 30%.
  if (game.state === 'playing' && game.slowmo > 0) {
    game.slowmo = Math.max(0, game.slowmo - raw);
    dt *= 0.3;
  }
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 40);
  if (game.fightT > 0) game.fightT = Math.max(0, game.fightT - raw);

  // age the power-pickup toasts & floor decals
  for (const t of game.toasts) t.t += raw;
  game.toasts = game.toasts.filter((t) => t.t < 3);
  for (const d of game.decals) d.t -= dt;
  game.decals = game.decals.filter((d) => d.t > 0);

  if (game.state === 'menu') return;
  if (game.state === 'matchover') {
    // confetti drifts over the podium for as long as the screen is up
    if (Math.random() < 0.2) spawnConfetti(rand(W * 0.1, W * 0.9), -14, 2);
    game.particles = game.particles.filter((p) => p.update(dt));
    return;
  }

  if (game.state === 'countdown') {
    game.countdownT -= dt;
    if (game.countdownT <= 0) {
      game.state = 'playing';
      game.fightT = 0.8; // "FIGHT!" splash
    }
  }

  if (game.hitstop > 0) {
    game.hitstop -= dt;
    if (game.state === 'playing') return;
  }

  if (game.state === 'playing') {
    // Hide & Seek phase clocks: first the seeker-blind setup, then the hunt.
    if (game.mode === 3) {
      if (game.hsSetup > 0) game.hsSetup = Math.max(0, game.hsSetup - dt);
      else game.hsTimer = Math.max(0, game.hsTimer - dt);
    }

    // pickups spawn (gated by the dynamic economy decay; none in Hide & Seek)
    if (game.mode !== 3) {
      game.pickupTimer -= dt;
      if (game.pickupTimer <= 0 && game.pickups.length < 3) {
        if (Math.random() < pickupSpawnChance()) {
          spawnPickup();
          game.pickupTimer = rand(5, 8.5);
        } else {
          game.pickupTimer = rand(2, 3.5); // leader heavily buffed — retry sooner, spawn less
        }
      }
    }

    // Hide & Seek: refund the seeker any attempt that actually lands a kill,
    // so only whiffs against decoys/scenery deplete the pool.
    const seeker = game.mode === 3 ? game.players.find((p) => p.role === 'seeker') : null;
    const seekerKillsBefore = seeker ? seeker.stats.kills : 0;

    // players
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      if (!p.alive) continue;
      let intents = p.isAI ? aiThink(p, dt) : humanIntents(p, i);
      // a blinded seeker is rooted in place during the setup window
      if (p === seeker && game.hsSetup > 0) intents = { move: [0, 0], aimX: p.aim[0], aimY: p.aim[1] };
      p.update(dt, intents);
    }
    resolvePlayerCollisions(); // soft separation + frozen-shatter-on-bump
    updateSwitches(); // floor switches drive their gates + the "Switcheroo" award
    for (const c of game.crushers) c.update(dt); // move blocks + squish the pinned
    spreadFire(); // burning fighters ignite their neighbours
    updateGolden(dt); // Golden Boomerang carry/score (no-op in other modes)
    updateBattleRoyale(dt); // shrinking lethal border (no-op unless triggered)
    // boomerangs
    for (const b of game.boomerangs) b.update(dt);
    resolveBoomerangHits();
    resolveSlashes();
    if (seeker && seeker.stats.kills > seekerKillsBefore) seeker.attemptsLeft += seeker.stats.kills - seekerKillsBefore;
    // DECOY clones: drift to a stop, age out, and pop when a foe's attack lands
    for (const d of game.decoys) {
      d.life -= dt;
      d.bob += dt * 8;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.pow(0.01, dt);
      d.vy *= Math.pow(0.01, dt);
    }
    resolveDecoyHits();
    game.decoys = game.decoys.filter((d) => d.life > 0);
    // hazards
    game.hazards = game.hazards.filter((h) => h.update(dt));
    // pickups
    game.pickups = game.pickups.filter((pk) => pk.update(dt));
    // cleanup dead boomerangs
    game.boomerangs = game.boomerangs.filter((b) => !b.dead);

    endRoundCheck();
  }

  if (game.state === 'roundover') {
    // let particles settle
    for (const b of game.boomerangs) b.update(dt);
    game.boomerangs = game.boomerangs.filter((b) => !b.dead);
    game.hazards = game.hazards.filter((h) => h.update(dt));
    game.roundoverT -= dt;
    if (game.roundoverT <= 0) {
      if (game.matchWinner) game.state = 'matchover';
      else startRound();
    }
  }

  game.particles = game.particles.filter((p) => p.update(dt));
}

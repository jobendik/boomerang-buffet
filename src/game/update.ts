import { audio } from '../core/audio';
import { BOUNDS, W } from '../constants';
import { dist, lerp, norm, rand, TAU } from '../core/math';
import { keys, mouse, readGamepad } from '../core/input';
import { aiThink } from '../systems/ai';
import { resolveBoomerangHits, resolveDecoyHits, resolvePlayerCollisions, resolveSlashes, spreadFire, updateSwitches } from '../systems/collision';
import { spawnConfetti, spawnPopText, spawnRing } from '../systems/effects';
import { POWERS } from '../data/powers';
import { Particle } from '../entities/Particle';
import { game } from './state';
import { endRoundCheck, pickupSpawnChance, spawnPickup, startRound } from './flow';
import type { Intents, Vec2 } from '../types';
import type { Player } from '../entities/Player';

/** Cadence timer for the sudden-death heartbeat (module-local scratch state). */
let heartT = 0;

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
      audio.roundWin();
    }
    return;
  }
  // unheld: the first living fighter to touch it becomes the new carrier
  g.carrier = null;
  for (const p of game.players) {
    if (p.alive && dist(p.x, p.y, g.x, g.y) < p.r + 16) {
      g.carrier = p;
      spawnRing(p.x, p.y, '#ffd23a', 1.3);
      audio.golden();
      break;
    }
  }
}

/** Per-frame simulation step and human input translation. */

/** Control scheme ids, as configured per human slot in `game.controlSchemes`. */
const SCHEME_MOUSE = 0;
const SCHEME_WASD = 1;
const SCHEME_IJKL = 2;
const SCHEME_GAMEPAD_BASE = 3; // 3..6 = Gamepad 1..4

/** Mouse aim/throw + arrow keys. Freely assignable to any human slot via the
 *  setup menu's control-scheme picker. */
function mouseIntents(p: Player): Intents {
  let mx = 0;
  let my = 0;
  // WASD only doubles as this player's move keys while nobody else is
  // actually assigned the WASD scheme (keeps solo play convenient without
  // stealing P2's keys once local multiplayer is using them).
  const wasdFree = !game.controlSchemes.slice(0, game.numHumans).includes(SCHEME_WASD);
  if (keys['ArrowUp'] || (wasdFree && keys['KeyW'])) my -= 1;
  if (keys['ArrowDown'] || (wasdFree && keys['KeyS'])) my += 1;
  if (keys['ArrowLeft'] || (wasdFree && keys['KeyA'])) mx -= 1;
  if (keys['ArrowRight'] || (wasdFree && keys['KeyD'])) mx += 1;
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

/**
 * Soft aim assist for humans on 8-way keys or a stick: if an enemy sits within
 * a narrow cone of where they're pointing, bend the aim toward that foe. Mouse
 * players aim pixel-perfect already, so only the coarse devices get the help —
 * it keeps keyboard/gamepad throws competitive without ever aiming for you.
 */
function assistAim(p: Player, aim: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestDot = 0.92; // ≈ ±23° cone — outside it, your aim is your aim
  const consider = (x: number, y: number): void => {
    const d = dist(p.x, p.y, x, y);
    if (d > 520 || d < 1) return;
    const dir = norm(x - p.x, y - p.y);
    const dot = dir[0] * aim[0] + dir[1] * aim[1];
    if (dot > bestDot) {
      bestDot = dot;
      best = [x, y];
    }
  };
  for (const q of game.players) {
    if (q.alive && !q.disguised && p.isEnemy(q)) consider(q.x, q.y);
  }
  // enemy DECOY clones magnetize too — the assist must be as gullible as the
  // eye, or assisted players would get free decoy-detection
  for (const d of game.decoys) {
    if (d.ownerIdx === p.idx || (p.team >= 0 && d.team >= 0 && p.team === d.team)) continue;
    consider(d.x, d.y);
  }
  if (!best) return aim;
  const dir = norm(best[0] - p.x, best[1] - p.y);
  return norm(lerp(aim[0], dir[0], 0.65), lerp(aim[1], dir[1], 0.65));
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

/** The WASD keys — the classic move set — plus a Z/X/C/V action cluster. */
const WASD_SCHEME: KeyScheme = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'KeyZ', slash: 'KeyX', dash: 'KeyC', throwKey: 'KeyV' };

/** The IJKL keys — same diamond shape as WASD, shifted onto the right hand —
 *  plus a U/O/N/comma action cluster. */
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
  const aim: Vec2 = assistAim(p, mx || my ? norm(mx, my) : p.aim);
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

/** A connected gamepad — left stick to move, right stick to aim (falling
 *  back to facing the move direction if the pad has no right stick pushed),
 *  face buttons for throw/slash/dash/jump. Works with any standard-mapping
 *  controller, including the PS5 DualSense. */
function gamepadIntents(p: Player, padIndex: number): Intents {
  const pad = readGamepad(padIndex);
  if (!pad) return { move: [0, 0], aimX: p.aim[0], aimY: p.aim[1] };
  const [mx, my] = pad.move;
  const aim: Vec2 = assistAim(p, pad.aim ? norm(pad.aim[0], pad.aim[1]) : mx || my ? norm(mx, my) : p.aim);
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
 *  humans always occupy the first `numHumans` slots) to whichever control
 *  scheme it's been assigned in `game.controlSchemes` — freely configurable
 *  per slot in the setup menu, independent of slot order. */
function humanIntents(p: Player, slot: number): Intents {
  const scheme = game.controlSchemes[slot] ?? slot;
  switch (scheme) {
    case SCHEME_MOUSE:
      return mouseIntents(p);
    case SCHEME_WASD:
      return keyboardIntents(p, WASD_SCHEME);
    case SCHEME_IJKL:
      return keyboardIntents(p, IJKL_SCHEME);
    default:
      return gamepadIntents(p, scheme - SCHEME_GAMEPAD_BASE);
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
  game.flash = Math.max(0, game.flash - dt);
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
    // fireworks pop in the sky above the podium…
    if (Math.random() < 0.022) {
      audio.pop();
      const fx = rand(W * 0.15, W * 0.85);
      const fy = rand(60, 210);
      const col = ['#ff5d6c', '#ffce54', '#7ad06d', '#7ad0ff', '#ff7ad0', '#c08bff'][Math.floor(rand(0, 6))];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + rand(-0.1, 0.1);
        const sp = rand(90, 220);
        game.particles.push(new Particle(fx, fy, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.9), col, rand(2, 4)));
      }
      spawnRing(fx, fy, col, 1.4);
    }
    // …and confetti cannons volley up from the podium's flanks
    if (Math.random() < 0.014) {
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 10; i++) {
        const cols = ['#ff5d6c', '#ffce54', '#7ad06d', '#7ad0ff', '#ff7ad0', '#c08bff'];
        game.particles.push(
          new Particle(W / 2 + side * 110 + rand(-8, 8), 330, side * rand(-30, 90), rand(-360, -220), rand(1.8, 2.8), cols[i % cols.length], rand(5, 9), 'confetti')
        );
      }
      audio.pop();
    }
    game.particles = game.particles.filter((p) => p.update(dt));
    return;
  }

  if (game.state === 'countdown') {
    const before = Math.ceil(game.countdownT);
    game.countdownT -= dt;
    if (Math.ceil(game.countdownT) < before && game.countdownT > 0) audio.pip(); // 3…2…1 blips
    if (game.countdownT <= 0) {
      game.state = 'playing';
      game.fightT = 0.8; // "FIGHT!" splash
      audio.fight();
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

    // Sudden death stall-breaker: long rounds get squeezed by a wall of fire
    // creeping in from the arena borders, forcing the kiters together. Hide &
    // Seek is exempt (it runs its own hunt clock).
    game.roundT += dt;
    if (game.mode !== 3) {
      const SUDDEN_AT = 45;
      if (!game.hurry && game.roundT >= SUDDEN_AT - 5) {
        game.hurry = true;
        spawnPopText(W / 2, 130, 'HURRY UP!', '#ffce54', 24);
        audio.hurry();
      }
      if (!game.sudden && game.roundT >= SUDDEN_AT) {
        game.sudden = true;
        game.raining = false; // the closing inferno dries the rain right up
        spawnPopText(W / 2, 130, 'SUDDEN DEATH!', '#ff5d6c', 30);
        audio.sudden();
        game.shake = Math.max(game.shake, 8);
      }
      if (game.sudden) {
        // a pounding heartbeat that quickens as the fire wall closes in
        heartT -= dt;
        if (heartT <= 0) {
          heartT = Math.max(0.42, 0.95 - (game.roundT - SUDDEN_AT) * 0.02);
          audio.heartbeat();
        }
        game.suddenEnc = Math.min(8 + (game.roundT - SUDDEN_AT) * 9, 200);
        const e = game.suddenEnc;
        for (const p of game.players) {
          if (!p.alive) continue;
          if (p.x < BOUNDS.l + e || p.x > BOUNDS.r - e || p.y < BOUNDS.t + e || p.y > BOUNDS.b - e) p.ignite(null);
        }
        // embers drifting off the advancing fire line
        if (Math.random() < 0.6) {
          const l = BOUNDS.l + e;
          const r = BOUNDS.r - e;
          const t = BOUNDS.t + e;
          const b = BOUNDS.b - e;
          let ex: number;
          let ey: number;
          if (Math.random() < 0.5) {
            ex = rand(l, r);
            ey = Math.random() < 0.5 ? t : b;
          } else {
            ex = Math.random() < 0.5 ? l : r;
            ey = rand(t, b);
          }
          game.particles.push(new Particle(ex, ey, rand(-14, 14), rand(-42, -10), rand(0.3, 0.6), Math.random() < 0.5 ? '#ff7b3a' : '#ffce54', rand(2, 4)));
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
      if (game.matchWinner) {
        game.state = 'matchover';
        audio.music('podium');
        // the podium fanfare — or a sad trombone moment if a bot took the crown
        if (game.matchWinner.isAI) audio.matchLose();
        else audio.matchWin();
      } else startRound();
    }
  }

  game.particles = game.particles.filter((p) => p.update(dt));
}

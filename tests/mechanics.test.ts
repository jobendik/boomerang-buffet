/**
 * Regression tests for the combat rules, driven through the REAL update
 * loop with scripted inputs (slot 0 on mouse + arrows, slot 1 on WASD).
 * Each scenario stages two fighters by hand and asserts the rule's outcome —
 * so "a shove at a pit's edge is a kill for the shover", "a parry speeds the
 * boomerang up", "ties go to the defender" and friends can't silently rot.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { game, tele } from '../src/game/state';
import { startMatch } from '../src/game/flow';
import { update } from '../src/game/update';
import { keys, mouse } from '../src/core/input';
import { Boomerang } from '../src/entities/Boomerang';
import { ARENAS } from '../src/data/arena';
import { POWER_KEYS } from '../src/data/powers';
import { computeAwards } from '../src/game/awards';
import { inBush } from '../src/systems/collision';
import type { Player } from '../src/entities/Player';

const DT = 1 / 60;
const idx = (name: string): number => ARENAS.findIndex((a) => a.name === name);

function step(n = 1, each?: () => void): void {
  for (let i = 0; i < n; i++) {
    each?.();
    update(DT);
  }
}

/** Stage a two-human round on `arena`, live and uncluttered. */
function duel(arena: string, numPlayers = 2): Player[] {
  for (const k of Object.keys(keys)) delete keys[k];
  for (const k of Object.keys(tele)) delete tele[k];
  mouse.down = mouse.rdown = false;
  Object.assign(game, { mode: 0, numPlayers, numHumans: 2, controlSchemes: [0, 1, 2, 3], arenaSel: idx(arena), fallProtect: 0, ghosts: true, target: 5, difficulty: 1, paused: false, slowmo: 0, hitstop: 0 });
  startMatch();
  game.state = 'playing';
  game.pickupTimer = 999;
  for (const p of game.players) {
    p.invuln = 0;
    p.ai.tThrow = 999; // any bots along for the ride keep their boomerangs
  }
  return game.players;
}

function place(p: Player, x: number, y: number, aimX = 1, aimY = 0): void {
  p.x = x;
  p.y = y;
  p.vx = p.vy = 0;
  p.aim = [aimX, aimY];
}

/** Throw a boomerang by hand: from `from`, flying (vx, vy). */
function launch(from: Player, x: number, y: number, vx: number, vy: number): Boomerang {
  const b = new Boomerang(from, vx, vy, 1.2, true);
  b.x = x;
  b.y = y;
  from.boomsInHand = 0;
  game.boomerangs.push(b);
  return b;
}

beforeEach(() => {
  game.state = 'menu';
});

describe('dash tackles', () => {
  it('shoves a rival across open floor without hurting them', () => {
    const [a, b] = duel('Grove');
    place(a, 600, 240);
    place(b, 660, 240, -1, 0);
    keys['ArrowRight'] = keys['Space'] = true;
    step(4);
    keys['ArrowRight'] = keys['Space'] = false;
    step(40);
    expect(b.alive).toBe(true);
    expect(a.stats.shoves).toBe(1);
    expect(b.x).toBeGreaterThan(660 + 60); // sent sliding
    expect(a.stats.kills).toBe(0);
  });

  it("credits the shover when the slide ends in a pit", () => {
    const [a, b] = duel('Pitfall');
    // Pitfall's west chasm spans x 150–270, y 250–390
    place(a, 60, 320);
    place(b, 118, 320, -1, 0);
    keys['ArrowRight'] = keys['Space'] = true;
    step(4);
    keys['ArrowRight'] = keys['Space'] = false;
    step(30);
    expect(b.alive).toBe(false);
    expect(a.stats.kills).toBe(1);
    expect(a.stats.ringOuts).toBe(1);
    expect(tele['kill:pit']).toBe(1);
    expect(tele['tag:DUNKED!']).toBe(1);
    expect(b.stats.selfKills).toBe(0);
  });

  it('lets the victim dash out of the slide and live', () => {
    const [a, b] = duel('Pitfall');
    place(a, 60, 320);
    place(b, 118, 320, -1, 0);
    keys['ArrowRight'] = keys['Space'] = true;
    step(3);
    keys['ArrowRight'] = keys['Space'] = false;
    // the moment we're knocked, dash back against it
    step(40, () => {
      keys['KeyA'] = keys['KeyC'] = b.stagger > 0;
    });
    expect(a.stats.shoves).toBe(1);
    expect(b.alive).toBe(true);
  });

  it('never shoves a teammate', () => {
    const [a, b] = duel('Grove');
    a.team = b.team = 0;
    place(a, 600, 240);
    place(b, 660, 240);
    keys['ArrowRight'] = keys['Space'] = true;
    step(4);
    keys['ArrowRight'] = keys['Space'] = false;
    step(20);
    expect(a.stats.shoves).toBe(0);
    expect(b.stagger).toBe(0);
  });
});

describe('parries and rallies', () => {
  it('bats the boomerang back faster, and an unarmed swat keeps the rally going', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 760, 240, -1, 0);
    mouse.x = b.x;
    mouse.y = b.y;
    const boom = launch(b, 600, 240, -520, 0);
    const v0 = Math.hypot(boom.vx, boom.vy);
    // a (armed) parries as it arrives…
    for (let i = 0; i < 60 && boom.rally < 1 && a.alive; i++) {
      mouse.rdown = !boom.dead && Math.hypot(boom.x - a.x, boom.y - a.y) < 80;
      update(DT);
    }
    mouse.rdown = false;
    expect(a.alive).toBe(true);
    expect(boom.origOwner).toBe(a);
    expect(boom.rally).toBe(1);
    const v1 = Math.hypot(boom.vx, boom.vy);
    expect(v1).toBeGreaterThan(v0 * 1.1);
    expect(boom.vx).toBeGreaterThan(0); // heading back at the thrower
    // …b threw it, so b is unarmed: a bare-handed swat must still return it
    expect(b.armed).toBe(false);
    for (let i = 0; i < 90 && boom.rally < 2 && b.alive; i++) {
      keys['KeyX'] = !boom.dead && Math.hypot(boom.x - b.x, boom.y - b.y) < 95;
      update(DT);
    }
    keys['KeyX'] = false;
    expect(b.alive).toBe(true);
    expect(boom.origOwner).toBe(b);
    expect(boom.rally).toBe(2);
    expect(Math.hypot(boom.vx, boom.vy)).toBeGreaterThan(v1 * 1.1);
    expect(a.stats.bestRally).toBe(2);
  });

  it('gives ties to the defender: a swing on the frame of impact still saves you', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 800, 240, -1, 0);
    mouse.x = b.x;
    mouse.y = b.y;
    // one step from now the boomerang lands squarely inside a's body
    const boom = launch(b, 400 + 30 + 600 * DT, 240, -600, 0);
    mouse.rdown = true;
    step(1);
    mouse.rdown = false;
    expect(a.alive).toBe(true);
    expect(boom.origOwner).toBe(a);
  });

  it('a bare-handed swat cannot hurt anyone', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 440, 240, -1, 0);
    a.boomsInHand = 0;
    mouse.x = b.x;
    mouse.y = b.y;
    mouse.rdown = true;
    step(10);
    mouse.rdown = false;
    expect(b.alive).toBe(true);
  });

  it('tags a kill with a parried boomerang', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 640, 240, -1, 0);
    mouse.x = b.x;
    mouse.y = b.y;
    const boom = launch(b, 520, 240, -520, 0);
    step(90, () => {
      mouse.rdown = !boom.dead && boom.origOwner === b && Math.hypot(boom.x - a.x, boom.y - a.y) < 80;
    });
    expect(b.alive).toBe(false);
    expect(a.stats.rallyKills).toBe(1);
    expect(tele['tag:RETURN TO SENDER!']).toBe(1);
  });
});

describe('clashes', () => {
  it('rival boomerangs bounce off each other mid-air', () => {
    const [a, b] = duel('Grove');
    place(a, 120, 560);
    place(b, 900, 560);
    const b1 = launch(a, 560, 240, 500, 0);
    const b2 = launch(b, 640, 240, -500, 0);
    step(8);
    expect(b1.dead || b2.dead).toBe(false);
    expect(b1.clashes).toBe(1);
    expect(b2.clashes).toBe(1);
    expect(b1.vx).toBeLessThan(0);
    expect(b2.vx).toBeGreaterThan(0);
  });

  it('two blades meeting is a clash, not a coin-flip', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 446, 240, -1, 0);
    mouse.x = b.x;
    mouse.y = b.y;
    mouse.rdown = true;
    keys['KeyX'] = true;
    step(2);
    mouse.rdown = false;
    keys['KeyX'] = false;
    step(10);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
    expect(a.stats.slashClashes).toBe(1);
    expect(b.x - a.x).toBeGreaterThan(80); // hurled apart
  });

  it('an uncontested swing still kills', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 446, 240, -1, 0);
    mouse.x = b.x;
    mouse.y = b.y;
    mouse.rdown = true;
    step(2);
    expect(b.alive).toBe(false);
    expect(a.stats.kills).toBe(1);
  });
});

describe('arena interactions', () => {
  it('a bumper fires a boomerang back out faster than it arrived', () => {
    const [a] = duel('Pinball');
    place(a, 120, 560);
    place(game.players[1], 900, 560);
    // Pinball's centre post sits at (512, 320) r 30
    const boom = launch(a, 420, 320, 500, 0);
    step(12);
    expect(boom.vx).toBeLessThan(0);
    expect(Math.hypot(boom.vx, boom.vy)).toBeGreaterThan(540);
    expect(boom.bounces).toBe(1);
  });

  it('a fire boomerang sets a bush ablaze, and it burns away', () => {
    const [a, b] = duel('Grove');
    game.raining = false; // (Grove's occasional shower would keep it damp)
    place(a, 120, 560);
    place(b, 900, 560);
    // Grove has a bush at x 440–532, y 150–220
    const boom = launch(a, 400, 185, 400, 0);
    boom.fire = true;
    expect(inBush(486, 185)).toBe(true);
    step(20);
    expect(game.bushes.some((bu) => bu.burnT > 0)).toBe(true);
    step(60 * 4);
    expect(game.bushes.filter((bu) => bu.burnt).length).toBeGreaterThanOrEqual(1);
    expect(inBush(486, 185)).toBe(false);
  });

  it("a ghost's gust can finish what its owner started", () => {
    const [a, b] = duel('Pitfall', 3);
    const c = game.players[2];
    place(c, 900, 560);
    place(a, 124, 320); // teetering beside the west chasm
    place(b, 60, 320);
    b.alive = false; // b is dead: only a ghost now, floating just west of a
    b.gx = 80;
    b.gy = 320;
    b.booCd = 0;
    keys['KeyC'] = true; // any action button
    step(2);
    keys['KeyC'] = false;
    step(30);
    expect(b.stats.haunts).toBe(1);
    expect(a.alive).toBe(false);
    expect(b.stats.kills).toBe(1);
    expect(b.stats.ghostKills).toBe(1);
  });
});

describe('round flow', () => {
  it('plays a finishing beat before calling the round', () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240, 1, 0);
    place(b, 446, 240, -1, 0);
    b.die(a, 1, 0);
    step(8); // (the kill's hitstop holds the sim for a few frames first)
    expect(game.state).toBe('playing'); // decided, not over
    expect(game.finishing).toBe(true);
    step(120);
    expect(game.state).toBe('roundover');
    expect(game.roundWinner).toBe(a);
    expect(a.score).toBe(1);
  });

  it("calls a DOUBLE KO if the winner doesn't survive the beat", () => {
    const [a, b] = duel('Grove');
    place(a, 400, 240);
    place(b, 700, 240);
    b.die(a, 1, 0);
    step(10);
    a.die(b, -1, 0); // b's boomerang was still in the air, say
    step(120);
    expect(game.state).toBe('roundover');
    expect(game.roundWinner).toBeNull();
    expect(a.score + b.score).toBe(0);
  });

  it('hands out a spread of awards after a bot match', () => {
    duel('Diner', 4);
    for (const p of game.players) p.isAI = true;
    let t = 0;
    while (game.state !== 'matchover' && t++ < 60 * 600) update(DT);
    expect(game.state).toBe('matchover');
    const awards = computeAwards(8);
    expect(awards.length).toBeGreaterThanOrEqual(4);
    // nobody leaves the podium empty-handed
    expect(new Set(awards.map((x) => x.player)).size).toBe(4);
    expect(new Set(awards.map((x) => x.title)).size).toBe(awards.length);
  });
});

describe('invariants under chaos', () => {
  it.each([0, 1, 2, 3])('mode %i: stacked random powers never corrupt the simulation', (mode) => {
    for (let run = 0; run < 3; run++) {
      duel(ARENAS[(run * 3 + mode * 2) % ARENAS.length].name, 4);
      game.mode = mode;
      game.target = 2;
      startMatch();
      for (const p of game.players) p.isAI = mode !== 3 || p.idx !== 0 ? true : p.isAI;
      let frames = 0;
      let lastRound = -1;
      while (game.state !== 'matchover' && frames++ < 60 * 240) {
        if (game.roundNum !== lastRound && game.state === 'playing') {
          lastRound = game.roundNum;
          for (const p of game.players) for (let k = 0; k < 5; k++) p.applyPower(POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)]);
        }
        update(DT);
        for (const p of game.players) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy), 'fighter went non-finite').toBe(true);
          expect(p.boomsInHand).toBeGreaterThanOrEqual(0);
          expect(p.boomsInHand).toBeLessThanOrEqual(p.boomsMax);
        }
        for (const b of game.boomerangs) expect(Number.isFinite(b.x) && Number.isFinite(b.vx), 'boomerang went non-finite').toBe(true);
        expect(game.boomerangs.length).toBeLessThan(80);
        expect(game.particles.length).toBeLessThanOrEqual(1100);
        expect(game.hazards.length).toBeLessThanOrEqual(260);
      }
    }
  });
});

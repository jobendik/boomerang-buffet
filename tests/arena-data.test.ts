/**
 * Arena data integrity: enforce the layout rules documented at the top of
 * `src/data/arena.ts` for EVERY arena, so a new map can't ship with a spawn
 * inside a wall, a switch pointing at a missing gate, or a crusher that
 * squishes fresh spawns. Plus a live check: bots must be able to actually
 * finish a match on each arena (no pathing dead-ends, no mass pit suicide).
 */

import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/data/arena';
import { BOUNDS } from '../src/constants';
import type { Rect } from '../src/types';
import { runMatch } from './sim';

const SPAWN_CLEAR = 40; // px a spawn must keep from anything dangerous/solid

function rectClearance(x: number, y: number, R: Rect): number {
  const dx = Math.max(R.x - x, 0, x - (R.x + R.w));
  const dy = Math.max(R.y - y, 0, y - (R.y + R.h));
  return Math.hypot(dx, dy);
}

/** Full area a crusher can occupy at any point of its cycle. */
function crusherSweep(c: { x: number; y: number; w: number; h: number; dx: number; dy: number }): Rect {
  return {
    x: Math.min(c.x, c.x + c.dx),
    y: Math.min(c.y, c.y + c.dy),
    w: c.w + Math.abs(c.dx),
    h: c.h + Math.abs(c.dy),
  };
}

describe.each(ARENAS.map((a, i) => ({ a, i })))('arena "$a.name"', ({ a, i }) => {
  it('has at least 6 spawns, all inside the field', () => {
    expect(a.spawns.length).toBeGreaterThanOrEqual(6);
    for (const s of a.spawns) {
      expect(s.x).toBeGreaterThan(BOUNDS.l + 17);
      expect(s.x).toBeLessThan(BOUNDS.r - 17);
      expect(s.y).toBeGreaterThan(BOUNDS.t + 17);
      expect(s.y).toBeLessThan(BOUNDS.b - 17);
    }
  });

  it(`keeps every spawn ≥ ${SPAWN_CLEAR}px clear of solids, pits, gates & crusher sweeps`, () => {
    for (const s of a.spawns) {
      for (const R of a.obstacles) {
        expect(rectClearance(s.x, s.y, R), `spawn ${s.x},${s.y} vs obstacle ${JSON.stringify(R)}`).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      }
      for (const P of a.pits) {
        expect(rectClearance(s.x, s.y, P), `spawn ${s.x},${s.y} vs pit ${JSON.stringify(P)}`).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      }
      for (const G of a.gates) {
        expect(rectClearance(s.x, s.y, G), `spawn ${s.x},${s.y} vs gate ${JSON.stringify(G)}`).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      }
      for (const C of a.crushers) {
        expect(rectClearance(s.x, s.y, crusherSweep(C)), `spawn ${s.x},${s.y} vs crusher sweep`).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      }
      for (const P of a.portals) {
        const d = Math.min(Math.hypot(s.x - P.ax, s.y - P.ay), Math.hypot(s.x - P.bx, s.y - P.by)) - P.r;
        expect(d, `spawn ${s.x},${s.y} vs portal trigger`).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      }
    }
  });

  it('wires every switch to an existing gate (and gates have a switch)', () => {
    for (const sw of a.switches) {
      expect(sw.gate).toBeGreaterThanOrEqual(0);
      expect(sw.gate).toBeLessThan(a.gates.length);
    }
    for (let g = 0; g < a.gates.length; g++) {
      expect(a.switches.some((sw) => sw.gate === g), `gate ${g} has no switch`).toBe(true);
    }
  });

  it('keeps geometry inside the arena bounds', () => {
    for (const R of [...a.obstacles, ...a.pits, ...a.gates, ...a.crushers.map(crusherSweep)]) {
      expect(R.x).toBeGreaterThanOrEqual(BOUNDS.l);
      expect(R.y).toBeGreaterThanOrEqual(BOUNDS.t);
      expect(R.x + R.w).toBeLessThanOrEqual(BOUNDS.r);
      expect(R.y + R.h).toBeLessThanOrEqual(BOUNDS.b);
    }
    for (const P of a.portals) {
      for (const [px, py] of [
        [P.ax, P.ay],
        [P.bx, P.by],
      ]) {
        expect(px).toBeGreaterThanOrEqual(BOUNDS.l);
        expect(px).toBeLessThanOrEqual(BOUNDS.r);
        expect(py).toBeGreaterThanOrEqual(BOUNDS.t);
        expect(py).toBeLessThanOrEqual(BOUNDS.b);
      }
    }
  });

  it('lets a bot-only match run to completion', () => {
    const stats = runMatch({ difficulty: 1, target: 2, arena: i, maxSimSeconds: 600 });
    expect(stats.timedOut, 'match never resolved — check for unreachable fighters').toBe(false);
    expect(stats.winnerSlot).not.toBeNull();
  });
});

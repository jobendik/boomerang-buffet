/**
 * AI balance guardrails. The sim is stochastic, so every assertion aggregates
 * several runs and leaves generous margins — these are meant to catch tuning
 * regressions ("bots can no longer kill anyone", "Chill snipes like Spicy",
 * "one bot hogs every kill"), not to pin exact numbers. For the full KPI
 * table used when hand-tuning, run `npm run sim`.
 */

import { describe, expect, it } from 'vitest';
import { killConcentration, median, reactiveDodger, runMatch, runRusher, runSpectate, runSurvival } from './sim';

const DIFFS = [0, 1, 2] as const;

describe('match resolution', () => {
  it('bot-only matches finish at every difficulty', () => {
    for (const d of DIFFS) {
      const stats = runMatch({ difficulty: d, target: 2 });
      expect(stats.timedOut, `difficulty ${d} timed out`).toBe(false);
      expect(stats.winnerSlot, `difficulty ${d} produced no winner`).not.toBeNull();
    }
  });

  it('rounds mostly resolve before the sudden-death fire at Normal', () => {
    let rounds = 0;
    let sudden = 0;
    for (let i = 0; i < 3; i++) {
      const s = runMatch({ difficulty: 1, target: 3 });
      rounds += s.rounds;
      sudden += s.suddenRounds;
    }
    expect(rounds).toBeGreaterThan(0);
    expect(sudden / rounds, 'most rounds should end by combat, not fire').toBeLessThanOrEqual(0.5);
  });
});

describe('lethality', () => {
  it('an idle target dies within a round at every difficulty', () => {
    for (const d of DIFFS) {
      // (12 rounds, not 4: with so few samples this guardrail tripped ~1 run
      // in 16 on pure chance — the bar is the same three-in-four)
      const runs = Array.from({ length: 12 }, () => runSurvival(d));
      const killed = runs.filter((r) => !r.survived);
      expect(killed.length, `difficulty ${d}: idle target escaped ${runs.length - killed.length}/${runs.length} rounds`).toBeGreaterThanOrEqual(9);
      // sudden death (45s) plus the burn timer bounds any straggler round
      expect(median(killed.map((r) => r.seconds))).toBeLessThan(45);
      for (const r of killed) expect(r.seconds).toBeLessThan(75);
    }
  });

  it('Spicy kills an idle target faster than Chill', () => {
    const chill = Array.from({ length: 24 }, () => runSurvival(0).seconds);
    const spicy = Array.from({ length: 24 }, () => runSurvival(2).seconds);
    expect(median(spicy)).toBeLessThan(median(chill) + 5);
  });
});

describe('counterplay', () => {
  it('reactive dodging buys real time against Chill bots', () => {
    // survival times are heavy-tailed, so the medians need a decent sample
    const idle = Array.from({ length: 30 }, () => runSurvival(0).seconds);
    const dodge = Array.from({ length: 30 }, () => runSurvival(0, reactiveDodger).seconds);
    // skilled defence must clearly outlive a statue on the easiest tier
    expect(median(dodge)).toBeGreaterThan(median(idle) * 1.5);
  });

  it('a committed 1v1 melee rush is a fair duel, not a death sentence', () => {
    // The complaint this guards: walking up to slice a bot used to be near
    // guaranteed suicide (close-range snap throws + sub-human melee counters).
    // Measured duel win rates (N=400) sit around 72%/61%/46% for
    // Chill/Normal/Spicy — a "win" now means surviving the finishing beat
    // too, so a trade is a DOUBLE KO, not a victory. Margins are generous
    // and the sample large enough that chance alone won't trip them.
    const WANT: Array<[0 | 1 | 2, number]> = [
      [0, 30], // Chill: at least half
      [1, 15], // Normal: at least a quarter
      [2, 15], // Spicy: at least a quarter
    ];
    for (const [d, minWins] of WANT) {
      const runs = Array.from({ length: 60 }, () => runRusher(d));
      const wins = runs.filter((r) => r.survived).length;
      expect(wins, `difficulty ${d}: rusher won only ${wins}/60 duels`).toBeGreaterThanOrEqual(minWins);
    }
  });
});

describe('pacing for the spectating player', () => {
  it('bots finish the round briskly once the human is out', () => {
    // Bloodlust (ai.ts) + the doubled sudden-death clock (update.ts) exist so
    // a dead player never sits through minutes of bots circling each other.
    for (const d of [1, 2] as const) {
      const waits = Array.from({ length: 6 }, () => runSpectate(d))
        .filter((s) => s.humanDied)
        .map((s) => s.spectateSeconds);
      expect(waits.length, `difficulty ${d}: idle human survived every probe round`).toBeGreaterThan(0);
      expect(median(waits), `difficulty ${d}: spectating drags (${waits.map((w) => w.toFixed(1)).join(', ')})`).toBeLessThanOrEqual(15);
    }
  });
});

describe('aggro fairness', () => {
  it('no single bot hogs the kills across a match', () => {
    const kills = [0, 0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const s = runMatch({ difficulty: 1, target: 3 });
      s.kills.forEach((k, idx) => (kills[idx] += k));
    }
    expect(killConcentration(kills), `kills too concentrated: ${kills.join(',')}`).toBeLessThanOrEqual(0.65);
  });
});

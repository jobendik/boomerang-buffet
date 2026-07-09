/**
 * AI tuning KPI report — not a pass/fail suite. Run with `npm run sim` to
 * print the numbers that matter when adjusting `TUNING` in src/systems/ai.ts:
 *
 *   · round length / pacing per difficulty (are fights snappy?)
 *   · sudden-death rate (are bots stalling?)
 *   · kills per minute (overall lethality curve across tiers)
 *   · kill concentration (is aggro spread working?)
 *   · idle vs circling-evader survival (does difficulty reward skill?)
 *
 * Set SIM_MATCHES / SIM_SURVIVALS to trade precision for speed.
 */

import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { killConcentration, median, reactiveDodger, runMatch, runSurvival } from './sim';

const MATCHES = Number(process.env.SIM_MATCHES ?? 5);
const SURVIVALS = Number(process.env.SIM_SURVIVALS ?? 8);
const DIFF_NAMES = ['Chill ', 'Normal', 'Spicy '];

describe.runIf(process.env.SIM_REPORT)('AI KPI report', () => {
  it('prints the tuning table', () => {
    const rows: string[] = [];
    rows.push('difficulty | med round s | sudden% | kills/min | conc. | idle surv s | evader surv s | evader gain');
    rows.push('-----------|-------------|---------|-----------|-------|-------------|---------------|------------');
    for (const d of [0, 1, 2] as const) {
      const matches = Array.from({ length: MATCHES }, () => runMatch({ difficulty: d, target: 3 }));
      const roundLens = matches.flatMap((m) => m.roundLengths);
      const rounds = matches.reduce((a, m) => a + m.rounds, 0);
      const sudden = matches.reduce((a, m) => a + m.suddenRounds, 0);
      const totalKills = matches.reduce((a, m) => a + m.kills.reduce((x, y) => x + y, 0), 0);
      const totalMin = matches.reduce((a, m) => a + m.simSeconds, 0) / 60;
      const aggregateKills = [0, 0, 0, 0];
      matches.forEach((m) => m.kills.forEach((k, i) => (aggregateKills[i] += k)));

      const idle = Array.from({ length: SURVIVALS }, () => runSurvival(d).seconds);
      const evade = Array.from({ length: SURVIVALS }, () => runSurvival(d, reactiveDodger).seconds);

      rows.push(
        [
          `${DIFF_NAMES[d]} (${d})`,
          median(roundLens).toFixed(1).padStart(11),
          `${((100 * sudden) / Math.max(1, rounds)).toFixed(0)}%`.padStart(7),
          (totalKills / totalMin).toFixed(1).padStart(9),
          killConcentration(aggregateKills).toFixed(2).padStart(5),
          median(idle).toFixed(1).padStart(11),
          median(evade).toFixed(1).padStart(13),
          `${(median(evade) / Math.max(0.1, median(idle))).toFixed(1)}x`.padStart(11),
        ].join(' | ')
      );
    }
    // NB: judge by the medians — the sim's long tails (censored rounds where
    // the proxy outlives the bots) make means unstable at practical N.
    const report = '\n' + rows.join('\n') + `\n(matches/diff: ${MATCHES}, survival runs/diff: ${SURVIVALS}, arena 0, 4 players)\n`;
    process.stdout.write(report);
    writeFileSync('tests/.last-sim-report.txt', report); // vitest reporters can swallow stdout — keep a copy
  });
});

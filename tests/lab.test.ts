/**
 * The design lab — not a pass/fail suite. `npm run lab` plays bot-only
 * matches on every arena and prints how often each of the game's systems
 * actually fires (shoves, ring-outs, parries, rallies, mid-air clashes,
 * trick-shot callouts, kills by cause). It's the instrument for answering
 * "does this mechanic show up in real play, or only on paper?" before and
 * after a change.
 *
 * LAB_MATCHES (per arena) and LAB_DIFF trade precision for speed.
 */

import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { ARENAS } from '../src/data/arena';
import { tele } from '../src/game/state';
import { median, runMatch } from './sim';

const MATCHES = Number(process.env.LAB_MATCHES ?? 4);
const DIFF = Number(process.env.LAB_DIFF ?? 1) as 0 | 1 | 2;

describe.runIf(process.env.SIM_LAB)('design lab', () => {
  it('prints event rates per arena', () => {
    const lines: string[] = [];
    const total: Record<string, number> = {};
    let totalRounds = 0;
    lines.push('arena      | rounds | med s | sudden% | kills/rd | self% | ringout% | tagged% | shove/rd | parry/rd | rally2+/rd | clash/rd');
    lines.push('-----------|--------|-------|---------|----------|-------|----------|---------|----------|----------|------------|---------');
    for (let a = 0; a < ARENAS.length; a++) {
      for (const k of Object.keys(tele)) delete tele[k];
      const ms = Array.from({ length: MATCHES }, () => runMatch({ difficulty: DIFF, target: 4, arena: a }));
      const rounds = ms.reduce((x, m) => x + m.rounds, 0);
      const sudden = ms.reduce((x, m) => x + m.suddenRounds, 0);
      const lens = ms.flatMap((m) => m.roundLengths);
      const g = (k: string): number => tele[k] ?? 0;
      const tagged = Object.keys(tele).filter((k) => k.startsWith('tag:')).reduce((x, k) => x + tele[k], 0);
      const kills = Math.max(1, g('kill'));
      lines.push(
        [
          ARENAS[a].name.padEnd(10),
          String(rounds).padStart(6),
          median(lens).toFixed(1).padStart(5),
          `${((100 * sudden) / Math.max(1, rounds)).toFixed(0)}%`.padStart(7),
          (g('kill') / rounds).toFixed(2).padStart(8),
          `${((100 * g('kill:self')) / kills).toFixed(0)}%`.padStart(5),
          `${((100 * (g('kill:pit') + g('kill:crush') - g('kill:self'))) / kills).toFixed(0)}%`.padStart(8),
          `${((100 * tagged) / kills).toFixed(0)}%`.padStart(7),
          (g('shove') / rounds).toFixed(2).padStart(8),
          (g('parry') / rounds).toFixed(2).padStart(8),
          (g('rally2') / rounds).toFixed(2).padStart(10),
          ((g('boomclash') + g('slashclash')) / rounds).toFixed(2).padStart(8),
        ].join(' | ')
      );
      for (const k of Object.keys(tele)) total[k] = (total[k] ?? 0) + tele[k];
      totalRounds += rounds;
    }
    lines.push('', `all arenas, ${totalRounds} rounds — events per round:`);
    for (const k of Object.keys(total).sort()) lines.push(`  ${k.padEnd(28)} ${(total[k] / totalRounds).toFixed(3)}`);
    const report = '\n' + lines.join('\n') + `\n(difficulty ${DIFF}, ${MATCHES} matches/arena, 4 bots)\n`;
    process.stdout.write(report);
    writeFileSync('tests/.last-lab-report.txt', report);
  });
});

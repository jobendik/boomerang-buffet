import { rand, TAU } from '../core/math';
import { Particle } from '../entities/Particle';
import { game } from '../game/state';
import type { Char, Vec2 } from '../types';

/** Particle-burst helpers that push effects into the global particle pool. */

export function spawnSlice(x: number, y: number, char: Char, dirx: number, diry: number): void {
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU);
    const sp = rand(60, 320);
    game.particles.push(
      new Particle(
        x,
        y,
        Math.cos(a) * sp + dirx * 120,
        Math.sin(a) * sp + diry * 120,
        rand(0.5, 1.1),
        Math.random() < 0.6 ? char.body : char.dark,
        rand(5, 12),
        'chunk'
      )
    );
  }
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU);
    const sp = rand(120, 360);
    game.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.6), '#fff', rand(2, 5)));
  }
  game.particles.push(new Particle(x, y, 0, 0, 0.45, char.body, 80, 'ring'));
}

export function spawnExplosion(x: number, y: number): void {
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU);
    const sp = rand(80, 420);
    game.particles.push(
      new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), Math.random() < 0.5 ? '#ffce54' : '#ff7b3a', rand(3, 9))
    );
  }
  game.particles.push(new Particle(x, y, 0, 0, 0.4, '#ffd23a', 120, 'ring'));
}

export function spawnRing(x: number, y: number, color: string, scale = 1): void {
  game.particles.push(new Particle(x, y, 0, 0, 0.4, color, 60 * scale, 'ring'));
}

export function spawnDashPuff(x: number, y: number, dir: Vec2, color: string): void {
  for (let i = 0; i < 8; i++) {
    game.particles.push(
      new Particle(
        x - dir[0] * 8,
        y - dir[1] * 8,
        -dir[0] * rand(20, 80) + rand(-40, 40),
        -dir[1] * rand(20, 80) + rand(-40, 40),
        rand(0.2, 0.4),
        color,
        rand(3, 6)
      )
    );
  }
}

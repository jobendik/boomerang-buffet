import { rand, TAU } from '../core/math';
import { Particle } from '../entities/Particle';
import { game } from '../game/state';
import type { Char, Vec2 } from '../types';

/** Particle-burst helpers that push effects into the global particle pool. */

export function spawnSlice(x: number, y: number, char: Char, dirx: number, diry: number): void {
  // The signature beat: the fighter splits into two body halves that tumble
  // apart along the cut line, pale interiors showing. The cut runs along the
  // killing blow's travel; the halves separate perpendicular to it.
  const cutA = dirx || diry ? Math.atan2(diry, dirx) : rand(0, TAU);
  const px = -Math.sin(cutA);
  const py = Math.cos(cutA);
  for (const side of [-1, 1]) {
    const half = new Particle(
      x + px * side * 3,
      y + py * side * 3,
      dirx * 110 + px * side * rand(70, 130) + rand(-15, 15),
      diry * 110 + py * side * rand(70, 130) - rand(30, 80),
      rand(0.75, 0.95),
      char.body,
      17,
      'half'
    );
    half.rot = 0;
    half.vr = side * rand(1.6, 4.5);
    half.char = char;
    half.aimV = [Math.cos(cutA), Math.sin(cutA)];
    half.sliceA = cutA;
    half.side = side;
    game.particles.push(half);
  }
  for (let i = 0; i < 10; i++) {
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
  game.flash = Math.max(game.flash, 0.14); // a full-screen blink of blast light
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU);
    const sp = rand(80, 420);
    game.particles.push(
      new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), Math.random() < 0.5 ? '#ffce54' : '#ff7b3a', rand(3, 9))
    );
  }
  game.particles.push(new Particle(x, y, 0, 0, 0.4, '#ffd23a', 120, 'ring'));
  spawnDecal(x, y, 42, 9, '16,9,14', 0.5); // lasting scorch on the floor
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

/** A single soft scuff of dust kicked up at running feet. */
export function spawnFootDust(x: number, y: number): void {
  game.particles.push(
    new Particle(x + rand(-4, 4), y + rand(-2, 2), rand(-18, 18), rand(-26, -8), rand(0.25, 0.45), 'rgba(255,243,223,.3)', rand(2.5, 4.5))
  );
}

/** A floating popup word at a kill/event site ("SLICED!", "CRUSHED!" …). */
export function spawnPopText(x: number, y: number, text: string, color: string, size = 19): void {
  game.particles.push(new Particle(x, Math.max(48, y - 26), 0, -34, 1.0, color, size, 'text', text));
}

/** A fading floor mark (explosion scorch, frost ring). Capped so the floor
 *  never silts up — the oldest decal is dropped first. */
export function spawnDecal(x: number, y: number, r: number, life: number, rgb: string, alpha: number): void {
  game.decals.push({ x, y, r, t: life, max: life, rgb, alpha });
  if (game.decals.length > 24) game.decals.shift();
}

/** A celebratory confetti burst (match-over screen, big plays). */
export function spawnConfetti(x: number, y: number, n: number): void {
  const cols = ['#ff5d6c', '#ffce54', '#7ad06d', '#7ad0ff', '#ff7ad0', '#c08bff', '#fff3df'];
  for (let i = 0; i < n; i++) {
    game.particles.push(
      new Particle(x + rand(-30, 30), y, rand(-60, 60), rand(20, 90), rand(2.2, 3.6), cols[i % cols.length], rand(5, 9), 'confetti')
    );
  }
}

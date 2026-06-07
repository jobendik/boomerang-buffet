import { ctx } from '../core/canvas';
import { clamp, dist, rand, TAU } from '../core/math';
import { game } from '../game/state';
import { Particle } from './Particle';
import type { Player } from './Player';

/** A lingering patch of fire dropped by a FIRE boomerang; damages on contact. */
export class FirePatch {
  x: number;
  y: number;
  owner: Player;
  life: number;
  max: number;
  r: number;

  constructor(x: number, y: number, owner: Player) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.life = 1.4;
    this.max = 1.4;
    this.r = 16;
  }

  /** @returns whether the patch is still alive after this step. */
  update(dt: number): boolean {
    this.life -= dt;
    for (const p of game.players) {
      if (
        p.alive &&
        p.invuln <= 0 &&
        p !== this.owner &&
        this.life > 0.2 &&
        dist(this.x, this.y, p.x, p.y) < this.r + p.r * 0.6
      ) {
        // stepping in fire sets you alight rather than killing instantly,
        // so you can still dash clear before the flames finish you off
        p.ignite(this.owner);
      }
    }
    if (Math.random() < 0.5) {
      game.particles.push(
        new Particle(
          this.x + rand(-6, 6),
          this.y + rand(-6, 6),
          rand(-10, 10),
          rand(-40, -15),
          rand(0.3, 0.6),
          Math.random() < 0.5 ? '#ffce54' : '#ff7b3a',
          rand(2, 5)
        )
      );
    }
    return this.life > 0;
  }

  draw(): void {
    const a = clamp(this.life / this.max, 0, 1);
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    g.addColorStop(0, `rgba(255,210,80,${0.7 * a})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
  }
}

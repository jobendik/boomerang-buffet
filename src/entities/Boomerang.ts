import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { dist, lerp, norm, rand, TAU } from '../core/math';
import { BOUNDS } from '../constants';
import { OBSTACLES } from '../data/arena';
import { drawBoomShape } from '../gfx/shapes';
import { blastKnock, circleRect, resolvePortals, shotTag } from '../systems/collision';
import { spawnDecal, spawnExplosion, spawnPopText, spawnRing } from '../systems/effects';
import { game } from '../game/state';
import { igniteBushAt } from '../systems/bushes';
import { FirePatch } from './FirePatch';
import { Particle } from './Particle';
import type { Player } from './Player';
import type { Rect } from '../types';

/**
 * A thrown boomerang. Flies out (optionally on a charged banking curve),
 * returns to its owner via homing, bounces off walls/obstacles, and can carry
 * BIG / FIRE / ICE / BOMB / MULTI modifiers stacked from the owner's powers.
 */
export class Boomerang {
  owner: Player;
  origOwner: Player;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: 'out' | 'return';
  outT: number;
  r: number;
  rot: number;
  isMain: boolean;
  transient: boolean;
  life: number;
  curve: number;
  big: boolean;
  fire: boolean;
  ice: boolean;
  bomb: boolean;
  multi: boolean;
  unstoppable: boolean;
  blastScale: number; // explosion radius multiplier (<1 for MULTI sub-bombs)
  tk: boolean; // TELEKINESIS — steered by the owner's aim while they hold throw
  dead: boolean;
  retT: number; // seconds spent homing back — the return speeds up over time
  fireT: number;
  bounceFlash: number;
  portalCd: number;
  trail: number[][]; // recent positions for the motion-blur streak
  /* how this throw got where it is — feeds the trick-shot callouts */
  bounces: number; // ricochets on the way out (walls, blocks, bumpers)
  portals: number; // teleporter hops
  rally: number; // consecutive parries it has survived (each winds it up faster)
  clashes: number; // times knocked off line by another boomerang or a blast
  travel: number; // px flown since launch / last parry
  bounceAt: number; // `travel` at the last counted ricochet
  clashAt: number; // `travel` when last knocked off line
  clashWith: Player | null; // whose boomerang did the knocking
  clashCd: number; // brief lockout so one mid-air collision resolves once
  prevOwner: Player | null; // who threw it before the last parry
  grazed: Set<number>; // fighters it has already whistled past (close-call credit)

  constructor(owner: Player, vx: number, vy: number, outTime: number, isMain: boolean) {
    this.owner = owner;
    this.origOwner = owner;
    this.x = owner.x + owner.aim[0] * (owner.r + 6);
    this.y = owner.y + owner.aim[1] * (owner.r + 6);
    this.vx = vx;
    this.vy = vy;
    this.phase = 'out';
    this.outT = outTime;
    this.r = 11;
    this.rot = 0;
    this.isMain = isMain;
    this.transient = false;
    this.life = 0;
    this.curve = 0;
    this.big = false;
    this.fire = false;
    this.ice = false;
    this.bomb = false;
    this.multi = false;
    this.unstoppable = false;
    this.blastScale = 1;
    this.tk = false;
    this.dead = false;
    this.retT = 0;
    this.fireT = 0;
    this.bounceFlash = 0;
    this.portalCd = 0;
    this.trail = [];
    this.bounces = 0;
    this.portals = 0;
    this.rally = 0;
    this.clashes = 0;
    this.travel = 0;
    this.bounceAt = -999;
    this.clashAt = 0;
    this.clashWith = null;
    this.clashCd = 0;
    this.prevOwner = null;
    this.grazed = new Set();
  }

  /** Record being knocked onto a new heading (by `who`'s boomerang, or a blast). */
  noteClash(who: Player | null): void {
    this.clashes++;
    this.clashAt = this.travel;
    this.clashWith = who;
  }

  get hitR(): number {
    return this.big ? this.r + 9 : this.r;
  }

  update(dt: number): void {
    this.rot += dt * 18; // a brisk tumble — fast enough to read as "spinning", slow enough to see the wing
    this.bounceFlash = Math.max(0, this.bounceFlash - dt);
    // record a short position history for the motion-blur streak
    this.trail.push([this.x, this.y]);
    if (this.trail.length > (this.rally > 0 ? 11 : 7)) this.trail.shift();
    if (this.transient) {
      this.life -= dt;
      if (this.life <= 0) {
        // a MULTI sub-bomb detonates at the end of its short flight rather than
        // fizzling out; a plain sub-projectile just expires
        if (this.bomb) this.explode();
        else this.kill(false);
        return;
      }
    }
    const owner = this.owner;

    // TELEKINESIS: while the owner holds the throw and stays alive, the
    // projectile is remote-piloted toward their aim instead of arcing home.
    if (this.tk) {
      if (owner.alive && owner.steering && !this.transient) {
        this.phase = 'out';
        const sp = 440;
        const tvx = owner.aim[0] * sp;
        const tvy = owner.aim[1] * sp;
        const k = 1 - Math.pow(0.0006, dt);
        this.vx = lerp(this.vx, tvx, k);
        this.vy = lerp(this.vy, tvy, k);
      } else {
        this.tk = false; // link released (or lost) → fall back to homing return
        this.phase = 'return';
      }
    }

    // charged banking curve while flying out
    if (!this.tk && this.phase === 'out' && this.curve) {
      const c = Math.cos(this.curve * dt);
      const s = Math.sin(this.curve * dt);
      const nvx = this.vx * c - this.vy * s;
      const nvy = this.vx * s + this.vy * c;
      this.vx = nvx;
      this.vy = nvy;
    }

    // phase / apex (telekinetic flight has no fixed apex — the pilot decides)
    if (this.phase === 'out' && !this.tk) {
      this.outT -= dt;
      if (this.outT <= 0 && !this.transient) {
        if (this.multi) {
          this.doSplit();
          return;
        }
        this.phase = 'return';
      }
    }
    if (this.phase === 'return' && owner.alive) {
      // steer toward owner — an eager return that accelerates the longer it
      // chases, so a whiffed throw costs seconds, not an eternity of downtime
      this.retT += dt;
      const [dx, dy] = [owner.x - this.x, owner.y - this.y];
      const [nx, ny] = norm(dx, dy);
      const sp = (this.big ? 430 : 540) * (1 + Math.min(1, this.retT) * 0.35);
      const cur = Math.hypot(this.vx, this.vy) || sp;
      const tvx = nx * Math.max(cur, sp);
      const tvy = ny * Math.max(cur, sp);
      this.vx = lerp(this.vx, tvx, 1 - Math.pow(0.00005, dt));
      this.vy = lerp(this.vy, tvy, 1 - Math.pow(0.00005, dt));
    } else if (this.phase === 'return' && !owner.alive) {
      // owner dead: fly straight and despawn
      this.life = (this.life || 0.7) - dt;
      if (this.life <= 0) {
        this.kill(false);
        return;
      }
    }

    const speedMul = this.big ? 0.85 : 1;
    this.x += this.vx * dt * speedMul;
    this.y += this.vy * dt * speedMul;
    this.travel += Math.hypot(this.vx, this.vy) * dt * speedMul;

    // wall bounce
    let bounced = false;
    if (this.x < BOUNDS.l + this.r) {
      this.x = BOUNDS.l + this.r;
      this.vx = Math.abs(this.vx);
      bounced = true;
    }
    if (this.x > BOUNDS.r - this.r) {
      this.x = BOUNDS.r - this.r;
      this.vx = -Math.abs(this.vx);
      bounced = true;
    }
    if (this.y < BOUNDS.t + this.r) {
      this.y = BOUNDS.t + this.r;
      this.vy = Math.abs(this.vy);
      bounced = true;
    }
    if (this.y > BOUNDS.b - this.r) {
      this.y = BOUNDS.b - this.r;
      this.vy = -Math.abs(this.vy);
      bounced = true;
    }
    if (bounced) {
      if (this.bomb) {
        this.explode();
        return;
      }
      if (this.multi && this.phase === 'out' && !this.transient) {
        this.doSplit();
        return;
      }
    }
    // obstacle bounce (static walls + any closed gates, which are solid too)
    // …and the crusher pistons, which make for moving banks
    const solids: Rect[] = game.gates.length || game.crushers.length ? [...OBSTACLES, ...game.gates.filter((g) => !g.open), ...game.crushers] : OBSTACLES;
    for (const R of solids) {
      const c = circleRect(this.x, this.y, this.r, R);
      if (c.hit) {
        this.x += c.nx! * c.pen!;
        this.y += c.ny! * c.pen!;
        const dot = this.vx * c.nx! + this.vy * c.ny!;
        this.vx -= 2 * dot * c.nx!;
        this.vy -= 2 * dot * c.ny!;
        bounced = true;
        if (this.bomb) {
          this.explode();
          return;
        }
        if (this.multi && this.phase === 'out' && !this.transient) {
          this.doSplit();
          return;
        }
      }
    }
    // spring-loaded bumpers: a ricochet that fires the boomerang back out
    // FASTER than it arrived, with a little extra flight time to use it
    for (const B of game.bumpers) {
      const dx = this.x - B.x;
      const dy = this.y - B.y;
      const min = B.r + this.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      this.x = B.x + nx * min;
      this.y = B.y + ny * min;
      const dot = this.vx * nx + this.vy * ny;
      if (dot < 0) {
        this.vx -= 2 * dot * nx;
        this.vy -= 2 * dot * ny;
      }
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const boost = Math.min(980, sp * 1.14 + 30) / sp;
      this.vx *= boost;
      this.vy *= boost;
      if (this.phase === 'out' && !this.transient) this.outT += 0.14;
      else if (this.transient) this.life += 0.1;
      B.flash = 0.3;
      audio.bumper();
      spawnRing(B.x, B.y, '#ff7ad0', 0.9);
      bounced = true;
      if (this.bomb) {
        this.explode();
        return;
      }
      if (this.multi && this.phase === 'out' && !this.transient) {
        this.doSplit();
        return;
      }
    }
    if (bounced) {
      // only ricochets on the way OUT (or off a parry) are marksmanship — the
      // homing return rattling round a pillar earns nothing
      // (and a rattle in a corner is one ricochet, not three)
      if ((this.phase === 'out' || this.transient) && this.travel - this.bounceAt > 45) {
        this.bounces++;
        this.bounceAt = this.travel;
      }
      this.bounceFlash = 0.12;
      // a little shower of impact sparks at the ricochet point
      for (let i = 0; i < 4; i++) {
        game.particles.push(
          new Particle(this.x, this.y, rand(-150, 150), rand(-150, 150), rand(0.12, 0.26), Math.random() < 0.5 ? '#fff' : this.origOwner.char.body, rand(1.5, 3))
        );
      }
      audio.bounce(); // ricochet knock (the engine's retrigger gap tames barrages)
    }

    // a wound-up rally throw sheds embers
    if (this.rally > 0 && Math.random() < 0.35 + this.rally * 0.15) {
      game.particles.push(new Particle(this.x + rand(-4, 4), this.y + rand(-4, 4), rand(-40, 40), rand(-40, 40), rand(0.15, 0.35), this.rally >= 3 ? '#fff' : '#ffce54', rand(1.5, 3)));
    }

    // teleporters carry boomerangs through too (velocity preserved)
    if (resolvePortals(this, dt)) this.portals++;

    // fire trail drops
    if (this.fire) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.09;
        game.hazards.push(new FirePatch(this.x, this.y, this.origOwner));
      }
    }

    // catch by owner (a slightly forgiving reach — snagging your own return
    // should feel magnetic, not fiddly)
    if (this.phase === 'return' && owner.alive && !this.transient) {
      if (dist(this.x, this.y, owner.x, owner.y) < owner.r + this.r + 6) {
        owner.catchBoomerang();
        this.kill(false);
      }
    }
  }

  /** MULTI: burst into a fan of short-lived sub-projectiles, then expire. */
  doSplit(): void {
    if (this.dead) return;
    const n = this.fire || this.bomb ? 4 : 5; // reduced count when elemental/explosive
    const baseA = Math.atan2(this.vy, this.vx);
    const sp = 470;
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * 0.62;
      const ex = new Boomerang(this.origOwner, Math.cos(a) * sp, Math.sin(a) * sp, 0.3, false);
      ex.x = this.x;
      ex.y = this.y;
      ex.transient = true;
      ex.life = 0.6;
      ex.fire = this.fire; // sub-projectiles keep the fire trail (smaller footprint)
      ex.ice = this.ice; // …and the elemental tag, so an ice-bomb fan still freezes
      ex.bomb = this.bomb; // MULTI + BOMB: each splinter carries a scaled-down blast
      ex.blastScale = this.bomb ? 0.62 : 1; // shrunk so the fan can't wipe the map
      ex.unstoppable = this.unstoppable; // an un-parryable fan stays un-parryable
      ex.bounces = this.bounces; // the fan inherits its parent's flight story
      ex.portals = this.portals;
      ex.travel = this.travel;
      ex.bounceAt = this.bounceAt;
      game.boomerangs.push(ex);
    }
    audio.throw_(0.3);
    this.kill(true);
  }

  explode(): void {
    if (this.dead) return;
    this.dead = true;
    audio.bomb();
    game.shake = Math.max(game.shake, 16);
    spawnExplosion(this.x, this.y);

    // Elemental stacking (Fire/Ice are exclusive, so at most one applies):
    //  · Ice + Bomb  → a wider blast that FREEZES caught fighters, not kills
    //  · Fire + Bomb → a caging ring of lingering fire around the perimeter
    const icy = this.ice;
    const R = (icy ? 112 : 78) * this.blastScale;
    if (icy) {
      spawnRing(this.x, this.y, '#bdf0ff', 2.0 * this.blastScale);
      spawnDecal(this.x, this.y, R * 0.8, 6, '170,225,250', 0.2); // frost bloom
    }
    spawnPopText(this.x, this.y - 30, icy ? 'FREEZE!' : 'BOOM!', icy ? '#bdf0ff' : '#ffce54', 16);

    for (const p of game.players) {
      if (!p.alive || p.invuln > 0) continue;
      const self = p === this.origOwner;
      // a blast hits enemies and the careless thrower, but spares teammates
      if (!self && !this.origOwner.isEnemy(p)) continue;
      if (dist(this.x, this.y, p.x, p.y) < R + p.r) {
        if (icy) {
          if (!self) p.freeze(); // a freeze-bomb is crowd control, not a self-kill
        } else {
          const [dx, dy] = norm(p.x - this.x, p.y - this.y);
          const tag = self ? {} : this.rally > 0 ? { tag: this.rally >= 2 ? `RALLY x${this.rally} KILL!` : 'HOT POTATO!', style: 3 + this.rally } : shotTag(this, p);
          p.die(this.origOwner, dx, dy, { pop: 'KABOOM!', cause: 'bomb', ...tag });
          if (self) this.origOwner.stats.bombSelfKills++; // "Short Fuse"
        }
      }
    }

    // Fire + Bomb: ring the blast in persistent fire patches
    if (this.fire) {
      const ringR = 64 * this.blastScale;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        game.hazards.push(new FirePatch(this.x + Math.cos(a) * ringR, this.y + Math.sin(a) * ringR, this.origOwner));
      }
    }

    // the shockwave hurls survivors (and passing boomerangs) outward, and a
    // blast next to the shrubbery sets it alight
    if (!icy) {
      blastKnock(this.x, this.y, R, this.origOwner);
      igniteBushAt(this.x, this.y, this.origOwner, R * 0.7);
    }

    if (this.isMain) this.origOwner.loseBoomerang();
  }

  kill(asLoss: boolean): void {
    if (this.dead) return;
    this.dead = true;
    if (asLoss && this.isMain) this.origOwner.loseBoomerang();
  }

  draw(): void {
    // telekinetic control tether back to the pilot
    if (this.tk && this.owner.alive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#9d7bff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(this.owner.x, this.owner.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.restore();
    }
    const s = this.big ? 16 : this.transient && !this.rally ? 9 : 11;
    // a rally winds the boomerang up — and it shows: owner's colour gives way
    // to gold, then orange, then white-hot
    const heat = RALLY_HEAT[Math.min(RALLY_HEAT.length - 1, this.rally)];
    const col = this.bounceFlash > 0 ? '#fff' : heat ?? this.origOwner.char.body;

    // a little shadow on the floor sells that it's flying above it
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 13, s * 0.85, s * 0.34, 0, 0, TAU);
    ctx.fill();

    // motion ribbon: a tapered blade swept through the recent flight path
    const n = this.trail.length;
    if (n > 2) {
      ctx.save();
      const pts = [...this.trail, [this.x, this.y]];
      const side = (sign: number, wMul: number): void => {
        for (let i = sign > 0 ? 0 : pts.length - 1; sign > 0 ? i < pts.length : i >= 0; i += sign) {
          const a = pts[Math.max(0, i - 1)];
          const b = pts[Math.min(pts.length - 1, i + 1)];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l = Math.hypot(dx, dy) || 1;
          const w = (i / (pts.length - 1)) * s * wMul * sign;
          ctx.lineTo(pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w);
        }
      };
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      side(1, 0.62);
      side(-1, 0.62);
      ctx.closePath();
      ctx.fill();
      // a bright core once it's really moving
      if (this.rally || Math.hypot(this.vx, this.vy) > 600) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        side(1, 0.22);
        side(-1, 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // elemental dressing
    if (this.fire) {
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.hitR + 10);
      g.addColorStop(0, 'rgba(255,200,60,.9)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 10, 0, TAU);
      ctx.fill();
    }
    if (this.ice) {
      ctx.fillStyle = 'rgba(150,230,255,.4)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 5, 0, TAU);
      ctx.fill();
    }
    if (this.bomb) {
      // an ice-bomb reads cold blue; a plain/fire bomb reads charcoal + spark
      ctx.fillStyle = this.ice ? '#1d3a4a' : '#2a2030';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitR + 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath();
      ctx.arc(this.x - 4, this.y - 5, 3.2, 0, TAU);
      ctx.fill();
      const blink = Math.floor(game.time * 12) % 2;
      ctx.fillStyle = this.ice ? (blink ? '#dff6ff' : '#7ad0ff') : blink ? '#ffd23a' : '#ff7b3a';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, TAU);
      ctx.fill();
      // a batted bomb wears its rally heat as a ring, so the stakes are plain
      if (heat) {
        ctx.strokeStyle = heat;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.hitR + 5, 0, TAU);
        ctx.stroke();
      }
    } else {
      // UNSTOPPABLE throws carry a hard red edge: "don't even try"
      if (this.unstoppable) {
        ctx.strokeStyle = 'rgba(255,77,122,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s + 5, this.rot, this.rot + 4.4);
        ctx.stroke();
      }
      drawBoomShape(this.x, this.y, s * (1 + Math.min(0.3, this.rally * 0.08)), this.rot, col, true);
    }

    // additive bloom: every boomerang is a small light source
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = s * (2.3 + Math.min(1.6, this.rally * 0.45));
    const g = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, gr);
    g.addColorStop(0, hexA(col, this.rally ? 0.5 : 0.3));
    g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, gr, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** Trail/body colour by rally count (index 0 = not in a rally → owner's colour). */
const RALLY_HEAT: (string | null)[] = [null, '#ffe08a', '#ffb347', '#ff7b3a', '#ffffff'];

/** '#rrggbb' → 'rgba(r,g,b,a)'. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

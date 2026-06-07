import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { clamp, dist, lerp, norm, rand, TAU } from '../core/math';
import { BOUNDS, SLASH_RANGE, SLASH_HALF } from '../constants';
import { CHARS } from '../data/characters';
import { SPAWNS } from '../data/arena';
import { POWERS, EXCLUSIVE_GROUPS, type PowerKey } from '../data/powers';
import { drawBoomShape, drawProp, roundRectPath } from '../gfx/shapes';
import { resolveCircleObstacles, resolveCrushers, resolvePortals, inPit, resolvePitSolids, nudgeFromPits, inBush } from '../systems/collision';
import { spawnDashPuff, spawnExplosion, spawnRing, spawnSlice } from '../systems/effects';
import { game } from '../game/state';
import { Boomerang } from './Boomerang';
import { Particle } from './Particle';
import { FirePatch } from './FirePatch';
import { IcePatch } from './IcePatch';
import type { Char, Intents, Spawn, Vec2 } from '../types';

/* ----------------------------- tuning constants -------------------------- */
const SLASH_ACTIVE = 0.12; // seconds the blade is "live"
const SLASH_CD = 0.42; // base melee cooldown
const SLASH_CD_FAST = 0.24; // with EXTRA (dual-wield)
const MAX_CURVE = 5.2; // rad/s angular velocity at full charge
const RESPAWN_TIME = 1.2; // delay before a lost boomerang returns to hand

interface AIState {
  tThink: number;
  target: Player | null;
  strafe: number;
  tStrafe: number;
  tThrow: number;
  tkSteer: number; // remaining time a bot keeps piloting a telekinetic throw
  goPower: PowerKey | null;
}

interface PlayerStats {
  dashes: number;
  clashes: number;
  deaths: number;
  kills: number;
  unarmedTime: number;
  frozenKills: number; // foes finished off while frozen  -> "Ice Breaker"
  burnKills: number; // foes burned to death              -> "Pyromaniac"
  bombSelfKills: number; // blown up by your own bomb      -> "Short Fuse"
  bamboozledKills: number; // kills while controls inverted -> "Drunken Master"
  bamboozledTime: number; // seconds suffering inverted ctl -> "Most Bamboozled"
  falls: number; // self-eliminations into a pit          -> "Slow Learner"
  bushTime: number; // seconds spent lurking in cover      -> "Rambo"
  crushDeaths: number; // times squished by a block        -> "Trash Compactor"
}

/** A fighter — either the human (idx 0) or a CPU-controlled snack. */
export class Player {
  char: Char;
  charIdx: number;
  idx: number;
  isAI: boolean;
  r: number;
  score: number;
  team: number; // -1 = free-for-all (everyone hostile), else team id
  goldTime: number; // Golden Boomerang: cumulative seconds carrying the artifact
  aim: Vec2;
  ai: AIState;
  /** Match-cumulative telemetry (survives round resets, drives end awards). */
  stats: PlayerStats;

  // stackable modifiers, persist until death
  powers: Set<PowerKey>;

  // boomerang inventory
  boomsInHand!: number;
  boomsMax!: number;
  respawns!: number[];

  // runtime state (assigned via reset())
  x!: number;
  y!: number;
  vx!: number;
  vy!: number;
  alive!: boolean;
  charge!: number;
  charging!: boolean;
  dashT!: number;
  dashCd!: number;
  invuln!: number;
  slashT!: number;
  slashCd!: number;
  frozen!: number;
  chilled!: number; // remaining seconds of COOL WALK slow
  chillBuild!: number; // cumulative chill exposure; freezes solid at the cap
  burning!: number; // remaining seconds before the burn turns lethal
  burnSource!: Player | null; // who gets credit if the burn kills us
  bamboozled!: number; // remaining seconds of inverted controls
  trailT!: number; // HOT FEET footprint cadence
  steering!: boolean; // actively piloting a TELEKINESIS throw this frame
  portalCd!: number; // teleporter re-entry lockout
  spawnFlash!: number;
  bob!: number;
  shieldFlash!: number;
  disguised!: boolean; // DISGUISE: held still long enough to look like scenery
  disguiseT!: number; // seconds of stillness accumulated toward disguising
  propIdx!: number; // which scenery prop we currently masquerade as
  inBush!: boolean; // standing in leafy cover this frame (bots can't see you)
  role!: 'seeker' | 'hider' | 'none'; // Hide & Seek assignment
  attemptsLeft!: number; // Hide & Seek: seeker's finite pool of throws/slashes

  constructor(charIdx: number, idx: number, isAI: boolean) {
    this.char = CHARS[charIdx];
    this.charIdx = charIdx;
    this.idx = idx;
    this.isAI = isAI;
    this.r = 17;
    this.powers = new Set();
    this.stats = {
      dashes: 0,
      clashes: 0,
      deaths: 0,
      kills: 0,
      unarmedTime: 0,
      frozenKills: 0,
      burnKills: 0,
      bombSelfKills: 0,
      bamboozledKills: 0,
      bamboozledTime: 0,
      falls: 0,
      bushTime: 0,
      crushDeaths: 0,
    };
    this.reset(SPAWNS[idx % SPAWNS.length]);
    this.score = 0;
    this.team = -1;
    this.goldTime = 0;
    this.aim = [1, 0];
    this.ai = {
      tThink: 0,
      target: null,
      strafe: rand(-1, 1) > 0 ? 1 : -1,
      tStrafe: 0,
      tThrow: rand(0.3, 1.2),
      tkSteer: 0,
      goPower: null,
    };
  }

  reset(sp: Spawn): void {
    this.x = sp.x;
    this.y = sp.y;
    this.vx = 0;
    this.vy = 0;
    this.alive = true;
    this.boomsInHand = 1;
    this.boomsMax = 1;
    this.respawns = [];
    this.charge = 0;
    this.charging = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.slashT = 0;
    this.slashCd = 0;
    this.frozen = 0;
    this.chilled = 0;
    this.chillBuild = 0;
    this.burning = 0;
    this.burnSource = null;
    this.bamboozled = 0;
    this.trailT = 0;
    this.steering = false;
    this.portalCd = 0;
    this.spawnFlash = 0.6;
    this.bob = rand(0, TAU);
    this.shieldFlash = 0;
    this.disguised = false;
    this.disguiseT = 0;
    this.propIdx = 0;
    this.inBush = false;
    this.role = 'none';
    this.attemptsLeft = 0;
    this.powers.clear(); // modifiers are lost on death / new round
  }

  get hasBoomerang(): boolean {
    return this.boomsInHand > 0;
  }
  /** Armed = holding at least one boomerang (can throw & slash). */
  get armed(): boolean {
    return this.boomsInHand > 0;
  }

  /** True if `o` is a valid target for us (self & teammates are never hostile).
   *  In free-for-all (team < 0) everyone is fair game. */
  isEnemy(o: Player): boolean {
    if (o === this) return false;
    if (this.team < 0 || o.team < 0) return true;
    return this.team !== o.team;
  }

  /** True while this fighter is hauling the Golden Boomerang. */
  get isGoldCarrier(): boolean {
    return game.golden != null && game.golden.carrier === this;
  }

  /** Hide & Seek role helpers. */
  get isSeeker(): boolean {
    return game.mode === 3 && this.role === 'seeker';
  }
  get isHider(): boolean {
    return game.mode === 3 && this.role === 'hider';
  }

  /** Apply a collected power-up, honouring stacking & elemental exclusion. */
  applyPower(type: PowerKey): void {
    // BAMBOOZLE is an anti-powerup: a timed affliction, not a kept modifier.
    if (type === 'BAMBOOZLE') {
      this.bamboozled = Math.max(this.bamboozled, 9);
      return;
    }
    // Honour mutually-exclusive groups (Fire/Ice, Hot Feet/Cool Walk): taking
    // one member drops the others in its group.
    for (const grp of EXCLUSIVE_GROUPS) {
      if (grp.includes(type)) for (const e of grp) if (e !== type) this.powers.delete(e);
    }
    this.powers.add(type);
    if (type === 'EXTRA') {
      this.boomsMax = 2;
      this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    }
  }

  /** Set this fighter alight — a contagious damage-over-time that, left
   *  unattended, becomes lethal. Dashing (see `update`) stamps it out. */
  ignite(source: Player | null): void {
    if (!this.alive || this.invuln > 0) return;
    if (this.burning <= 0) audio.tick();
    this.burning = Math.max(this.burning, 1.7);
    this.burnSource = source && source.alive ? source : this.burnSource;
  }

  /* intents are set by human input or AI before update */
  update(dt: number, intents: Intents): void {
    if (!this.alive) return;
    this.bob += dt * 8;

    // timers
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.slashCd = Math.max(0, this.slashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.spawnFlash = Math.max(0, this.spawnFlash - dt);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);
    if (this.slashT > 0) this.slashT = Math.max(0, this.slashT - dt);
    if (this.dashT > 0) this.dashT = Math.max(0, this.dashT - dt);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);

    // COOL WALK chill: each step on ice slows you and stacks toward a freeze;
    // step off and the chill thaws away.
    if (this.chilled > 0) {
      this.chilled = Math.max(0, this.chilled - dt);
      this.chillBuild += dt;
      if (this.chillBuild >= 1.5) {
        this.chillBuild = 0;
        this.freeze();
      }
    } else if (this.chillBuild > 0) {
      this.chillBuild = Math.max(0, this.chillBuild - dt * 0.8);
    }

    // inverted-controls affliction (telemetry feeds the Drunken/Bamboozled awards)
    if (this.bamboozled > 0) {
      this.bamboozled = Math.max(0, this.bamboozled - dt);
      this.stats.bamboozledTime += dt;
    }

    // rain quickly douses flames — stand in the open and the burn fizzles out
    if (this.burning > 0 && game.raining) {
      this.burning = Math.max(0, this.burning - dt * 4);
      if (this.burning <= 0) spawnRing(this.x, this.y, '#9fd6ff', 0.7);
    }

    // burning damage-over-time: lethal once the timer elapses
    if (this.burning > 0) {
      this.burning -= dt;
      if (Math.random() < 0.7) {
        game.particles.push(
          new Particle(this.x + rand(-8, 8), this.y + rand(-10, 4), rand(-12, 12), rand(-50, -20), rand(0.25, 0.5), Math.random() < 0.5 ? '#ffce54' : '#ff7b3a', rand(2, 5))
        );
      }
      if (this.burning <= 0) {
        // Burning/Frozen paradox: freezing never clears the burn underneath, so
        // a frozen-and-burning fighter still dies here when the burn elapses —
        // and the ice block shatters with them (FX handled in `die`).
        const src = this.burnSource;
        if (src && src !== this) src.stats.burnKills++;
        const dir: Vec2 = [rand(-1, 1), rand(-1, 1)];
        this.die(src, dir[0], dir[1]);
        return;
      }
    }

    // boomerang respawns (lost boomerangs return to hand after a delay)
    if (this.respawns.length) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        this.respawns[i] -= dt;
        if (this.respawns[i] <= 0) {
          this.respawns.splice(i, 1);
          this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
        }
      }
    }

    // unarmed-time telemetry (the vulnerable, weaponless window)
    if (!this.armed) this.stats.unarmedTime += dt;

    const frozen = this.frozen > 0;
    const caffeinated = this.powers.has('SPEED');

    // BAMBOOZLE inverts the movement vector (aim is untouched, so you can still
    // point your throws — the chaos is purely in getting where you intend).
    if (this.bamboozled > 0) intents.move = [-intents.move[0], -intents.move[1]];

    // aim
    if (!frozen) this.aim = norm(intents.aimX, intents.aimY);

    // movement
    let speedMul = 1;
    if (caffeinated) speedMul = 1.45;
    if (this.charging) speedMul *= 0.55;
    if (this.chilled > 0) speedMul *= 0.5; // slogging through ice
    if (this.isGoldCarrier) speedMul *= 0.85; // hauling the artifact slows you
    const baseSpeed = 235 * speedMul;
    if (frozen) intents.move = [0, 0];

    if (this.dashT > 0) {
      // dash overrides
    } else {
      const [mx, my] = intents.move;
      const target = norm(mx, my);
      const goal = mx || my ? [target[0] * baseSpeed, target[1] * baseSpeed] : [0, 0];
      this.vx = lerp(this.vx, goal[0], 1 - Math.pow(0.0009, dt));
      this.vy = lerp(this.vy, goal[1], 1 - Math.pow(0.0009, dt));
    }

    // frozen fighters mash dash to crack the ice apart and break free early
    if (frozen && intents.dash) {
      this.frozen = Math.max(0, this.frozen - 0.32);
      if (Math.random() < 0.4) audio.tick();
      if (this.frozen <= 0) spawnRing(this.x, this.y, '#bdf0ff', 1.0);
    }

    // dash / teleport trigger
    if (!frozen && intents.dash && this.dashCd <= 0 && this.dashT <= 0) {
      if (this.powers.has('TELEPORT') && this.tryTeleport()) {
        // teleported to an airborne boomerang
      } else {
        const d: Vec2 = intents.move[0] || intents.move[1] ? norm(intents.move[0], intents.move[1]) : this.aim;
        this.vx = d[0] * 660;
        this.vy = d[1] * 660;
        this.dashT = 0.17;
        this.dashCd = caffeinated ? 0.22 : 0.7; // Caffeinated greatly cuts dash cooldown
        this.invuln = Math.max(this.invuln, 0.26);
        audio.dash();
        spawnDashPuff(this.x, this.y, d, this.char.body);
      }
      // a quick dash beats out flames (Caffeine's reset enables rapid stomping)
      if (this.burning > 0) {
        this.burning = 0;
        spawnRing(this.x, this.y, '#9fd6ff', 0.8);
      }
      this.stats.dashes++;
    }

    // slash trigger — only while ARMED (mirrors Boomerang Fu's state machine).
    // A Hide & Seek seeker may only swing while attempts remain.
    if (!frozen && intents.slash && this.armed && this.slashCd <= 0 && this.slashT <= 0 && (!this.isSeeker || this.attemptsLeft > 0)) {
      if (this.isSeeker) this.attemptsLeft--;
      this.slashT = SLASH_ACTIVE;
      this.slashCd = this.powers.has('EXTRA') ? SLASH_CD_FAST : SLASH_CD;
      // STAB lunges the fighter forward on the swing — an aggressive gap-closer.
      if (this.powers.has('STAB')) {
        this.vx = this.aim[0] * 560;
        this.vy = this.aim[1] * 560;
        this.dashT = Math.max(this.dashT, 0.13);
        this.invuln = Math.max(this.invuln, 0.1);
        spawnDashPuff(this.x, this.y, this.aim, POWERS.STAB.color);
      }
      audio.dash();
    }

    // HOT FEET / COOL WALK: lay an elemental trail while moving at speed
    if ((this.powers.has('HOTFEET') || this.powers.has('COOLWALK')) && !frozen) {
      this.trailT -= dt;
      if (this.trailT <= 0 && Math.hypot(this.vx, this.vy) > 120) {
        this.trailT = 0.1;
        if (this.powers.has('HOTFEET')) game.hazards.push(new FirePatch(this.x, this.y, this));
        else game.hazards.push(new IcePatch(this.x, this.y, this));
      }
    }

    // friction during dash decay
    if (this.dashT > 0) {
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
    }

    // integrate (axis-separated so we slide along walls instead of snagging)
    this.x += this.vx * dt;
    if (this.x < BOUNDS.l + this.r) {
      this.x = BOUNDS.l + this.r;
      this.vx = 0;
    }
    if (this.x > BOUNDS.r - this.r) {
      this.x = BOUNDS.r - this.r;
      this.vx = 0;
    }
    this.y += this.vy * dt;
    if (this.y < BOUNDS.t + this.r) {
      this.y = BOUNDS.t + this.r;
      this.vy = 0;
    }
    if (this.y > BOUNDS.b - this.r) {
      this.y = BOUNDS.b - this.r;
      this.vy = 0;
    }
    resolveCircleObstacles(this);
    resolveCrushers(this); // crushing blocks are solid walls while at rest/moving
    resolvePortals(this, dt);

    // bottomless pits, modulated by the Fall-Protection accessibility setting.
    if (game.fallProtect === 2) {
      // Extreme: pits act as solid walls — entry is simply impossible.
      resolvePitSolids(this);
    } else {
      // Gentle: nudge the player back from the lip (danger softened, not gone).
      if (game.fallProtect === 1) nudgeFromPits(this, dt);
      // A grounded fighter who stops over a pit falls out; dashing leaps it.
      if (this.dashT <= 0 && inPit(this.x, this.y)) {
        this.fall();
        return;
      }
    }

    // leafy cover: lurking in a bush hides you from bots and earns "Rambo"
    this.inBush = inBush(this.x, this.y);
    if (this.inBush) this.stats.bushTime += dt;

    // throw handling
    const telekinetic = this.powers.has('TELEKINESIS');
    if (this.ai.tkSteer > 0) this.ai.tkSteer = Math.max(0, this.ai.tkSteer - dt);
    if (!frozen) {
      if (this.isAI) {
        if (intents.throwNow && this.armed) this.doThrow(intents.charge ?? 0.6);
      } else if (telekinetic) {
        // press-to-launch, hold-to-pilot — no charge meter while telekinetic
        if (intents.throwHeld && this.armed && !this.hasActiveTk()) this.doThrow(0);
        this.charging = false;
        this.charge = 0;
      } else {
        if (intents.throwHeld && this.armed) {
          this.charging = true;
          this.charge = clamp(this.charge + dt / 0.55, 0, 1);
        }
        if (!intents.throwHeld && this.charging) {
          // release
          if (this.armed) this.doThrow(this.charge);
          this.charging = false;
          this.charge = 0;
        }
        if (!this.armed) {
          this.charging = false;
          this.charge = 0;
        }
      }
    }

    // am I actively piloting a telekinetic boomerang this frame?
    this.steering = false;
    if (telekinetic && this.hasActiveTk()) {
      this.steering = this.isAI ? this.ai.tkSteer > 0 : !!intents.throwHeld;
    }

    // DISGUISE: hold still and you melt into the scenery as a static prop.
    // Any movement, attack or charge instantly blows your cover (and bots are
    // coded never to see through it — see ai.ts targeting). Hide & Seek hiders
    // get the same behaviour for free once the setup window closes.
    if ((this.powers.has('DISGUISE') || (this.isHider && game.hsSetup <= 0)) && !frozen) {
      const moving = !!(intents.move[0] || intents.move[1]) || Math.hypot(this.vx, this.vy) > 26;
      const acting = !!(intents.slash || intents.dash || intents.throwNow || intents.throwHeld) || this.charging || this.slashT > 0 || this.dashT > 0;
      if (moving || acting) {
        if (this.disguised) spawnRing(this.x, this.y, POWERS.DISGUISE.color, 0.9);
        this.disguised = false;
        this.disguiseT = 0;
      } else {
        this.disguiseT += dt;
        if (!this.disguised && this.disguiseT > 0.5) {
          this.disguised = true;
          this.propIdx = Math.floor(rand(0, 3)) % 3;
          spawnRing(this.x, this.y, POWERS.DISGUISE.color, 0.9);
        }
      }
    } else {
      this.disguised = false;
      this.disguiseT = 0;
    }
  }

  /** True while one of our telekinetic throws is still airborne. */
  hasActiveTk(): boolean {
    for (const b of game.boomerangs) {
      if (!b.dead && b.tk && b.origOwner === this) return true;
    }
    return false;
  }

  /** Dash → teleport to your nearest airborne boomerang and re-equip it. */
  private tryTeleport(): boolean {
    let tgt: Boomerang | null = null;
    let bd = Infinity;
    for (const b of game.boomerangs) {
      if (b.dead || !b.isMain || b.transient || b.origOwner !== this) continue;
      const d = dist(this.x, this.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        tgt = b;
      }
    }
    if (!tgt) return false;
    spawnRing(this.x, this.y, '#8affd6', 1.1);
    this.x = tgt.x;
    this.y = tgt.y;
    this.vx = 0;
    this.vy = 0;
    tgt.dead = true; // re-equipped, not lost (conserves inventory)
    this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    this.invuln = Math.max(this.invuln, 0.2);
    this.dashCd = this.powers.has('SPEED') ? 0.22 : 0.7;
    spawnRing(this.x, this.y, '#8affd6', 1.2);
    audio.catch_();
    // squash-kill: warping straight onto a foe crushes them flat
    for (const q of game.players) {
      if (!q.alive || q.invuln > 0 || !this.isEnemy(q)) continue;
      if (dist(this.x, this.y, q.x, q.y) < this.r + q.r) {
        const [dx, dy] = norm(q.x - this.x, q.y - this.y);
        q.die(this, dx, dy);
      }
    }
    return true;
  }

  doThrow(charge: number): void {
    // Hide & Seek seeker: each throw spends one of a finite pool of attempts.
    if (this.isSeeker) {
      if (this.attemptsLeft <= 0) return;
      this.attemptsLeft--;
    }
    charge = clamp(charge, 0.12, 1);
    const [ax, ay] = this.aim;
    const speed = 430 + charge * 230;
    // WEAK ARM (anti-power): the boomerang turns back at half the usual range.
    const outTime = (0.42 + charge * 0.4) * (this.powers.has('WEAKARM') ? 0.5 : 1);
    const curve = charge * MAX_CURVE; // longer hold => stronger banking curve
    const main = new Boomerang(this, ax * speed, ay * speed, outTime, true);
    main.curve = curve;
    // The Golden Boomerang carrier's modifiers are suspended — a plain throw only.
    if (!this.isGoldCarrier) {
      main.big = this.powers.has('BIG');
      main.fire = this.powers.has('FIRE');
      main.ice = this.powers.has('ICE');
      main.bomb = this.powers.has('BOMB');
      main.multi = this.powers.has('MULTI');
      main.unstoppable = this.powers.has('UNSTOPPABLE');
      if (this.powers.has('TELEKINESIS')) {
        main.tk = true;
        main.curve = 0; // piloted, not arced
        if (this.isAI) this.ai.tkSteer = 1.3; // bots steer toward the foe for a beat
      }
    }
    game.boomerangs.push(main);
    this.boomsInHand--;
    audio.throw_();
  }

  /** A boomerang of ours left play uncaught — schedule its return to hand. */
  loseBoomerang(): void {
    this.respawns.push(RESPAWN_TIME);
  }

  catchBoomerang(): void {
    this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    audio.catch_();
    spawnRing(this.x, this.y, this.char.body, 0.9);
  }

  freeze(): void {
    this.frozen = Math.max(this.frozen, 1.7);
    audio.freeze();
    spawnRing(this.x, this.y, '#bdf0ff', 1.1);
  }

  /** Chilled by a COOL WALK ice trail: slowed now, frozen if you linger. */
  chill(): void {
    if (!this.alive || this.invuln > 0 || this.frozen > 0) return;
    this.chilled = Math.max(this.chilled, 0.4);
  }

  /** Plunge into a bottomless pit — a self-elimination, no kill credited. */
  fall(): void {
    if (!this.alive) return;
    this.stats.falls++;
    spawnRing(this.x, this.y, '#0b0712', 1.4);
    spawnRing(this.x, this.y, '#6a4f96', 1.0);
    audio.freeze();
    // route through die() for the shared bookkeeping (death count, GHOST, etc.)
    this.die(null, 0, 0);
  }

  /** Squished by a kinematic block — an environmental death, no killer. */
  crush(): void {
    if (!this.alive || this.invuln > 0) return;
    game.shake = Math.max(game.shake, 16);
    this.die(null, 0, -1); // Shield (handled in die) can still save you here
    if (!this.alive) this.stats.crushDeaths++; // count only an actual squish
  }

  die(killer: Player | null, dirx: number, diry: number): void {
    if (!this.alive) return;
    // Shield intercepts the next lethal hit instead of dying.
    if (this.powers.has('SHIELD')) {
      this.powers.delete('SHIELD');
      this.invuln = Math.max(this.invuln, 0.6);
      this.shieldFlash = 0.4;
      audio.parry();
      spawnRing(this.x, this.y, POWERS.SHIELD.color, 1.3);
      return;
    }
    // drop the Golden Boomerang where we fall, for the next contender to grab
    if (this.isGoldCarrier && game.golden) {
      game.golden.carrier = null;
      // ...but never strand it down a pit — recentre if we died over the void
      if (inPit(this.x, this.y)) {
        game.golden.x = (BOUNDS.l + BOUNDS.r) / 2;
        game.golden.y = (BOUNDS.t + BOUNDS.b) / 2;
      } else {
        game.golden.x = this.x;
        game.golden.y = this.y;
      }
      spawnRing(this.x, this.y, '#ffd23a', 1.4);
    }
    const wasFrozen = this.frozen > 0;
    this.alive = false;
    this.stats.deaths++;
    if (killer && killer !== this) {
      killer.stats.kills++;
      if (wasFrozen) killer.stats.frozenKills++; // "Ice Breaker"
      if (killer.bamboozled > 0) killer.stats.bamboozledKills++; // "Drunken Master"
    }
    this.burning = 0;
    this.frozen = 0;
    audio.slice();
    spawnSlice(this.x, this.y, this.char, dirx, diry);
    if (wasFrozen) spawnRing(this.x, this.y, '#bdf0ff', 1.3); // the ice block shatters
    game.shake = Math.max(game.shake, 14);
    game.hitstop = Math.max(game.hitstop, 0.09);

    // OUT WITH A BANG: detonate on death, taking nearby foes with you.
    // `alive` is already false, so the blast can't recursively re-kill us.
    if (this.powers.has('GHOST')) {
      audio.bomb();
      spawnExplosion(this.x, this.y);
      game.shake = Math.max(game.shake, 16);
      const R = 84;
      for (const q of game.players) {
        if (!q.alive || q.invuln > 0 || !this.isEnemy(q)) continue;
        if (dist(this.x, this.y, q.x, q.y) < R + q.r) {
          const [dx, dy] = norm(q.x - this.x, q.y - this.y);
          q.die(this, dx, dy);
        }
      }
    }
  }

  /* ---- rendering ---- */
  draw(): void {
    if (!this.alive) return;

    // DISGUISE: render as inert scenery, hiding all the usual fighter tells.
    // The human keeps a faint coloured pulse so they can still find themselves.
    if (this.disguised) {
      ctx.save();
      ctx.translate(this.x, this.y);
      drawProp(this.propIdx, this.r + 2);
      if (!this.isAI) {
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(game.time * 6);
        ctx.strokeStyle = POWERS.DISGUISE.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.r + 6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const bobY = Math.sin(this.bob) * 1.8;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.r * 0.95, this.r * 0.9, this.r * 0.42, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y + bobY);

    // stacked power auras (one faint ring per active modifier)
    let ringIdx = 0;
    for (const key of this.powers) {
      const p = POWERS[key];
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.14 * Math.sin(game.time * 6 + ringIdx);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 7 + ringIdx * 3.5, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ringIdx++;
    }
    // shield pop flash
    if (this.shieldFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.shieldFlash / 0.4;
      ctx.strokeStyle = POWERS.SHIELD.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 12, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // invuln flicker
    if (this.invuln > 0 && Math.floor(game.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;
    // lurking in foliage fades the fighter into the leaves
    if (this.inBush) ctx.globalAlpha *= 0.45;

    this.char.draw(this.char, this.r, this.aim);

    // slash arc swoosh
    if (this.slashT > 0) {
      const a = Math.atan2(this.aim[1], this.aim[0]);
      const k = this.slashT / SLASH_ACTIVE;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, this.r + SLASH_RANGE * 0.7, a - SLASH_HALF, a + SLASH_HALF);
      ctx.stroke();
      ctx.strokeStyle = `rgba(180,240,255,${0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // burning glow (the fiery particles themselves come from update())
    if (this.burning > 0) {
      ctx.save();
      const fa = 0.35 + 0.2 * Math.sin(game.time * 22);
      const g = ctx.createRadialGradient(0, 0, this.r * 0.4, 0, 0, this.r + 12);
      g.addColorStop(0, `rgba(255,170,40,${fa})`);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 12, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // bamboozled: dizzy spinning marks orbiting the head
    if (this.bamboozled > 0) {
      ctx.save();
      ctx.fillStyle = POWERS.BAMBOOZLE.color;
      ctx.font = '900 12px "Trebuchet MS"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const a = game.time * 7 + (i * TAU) / 3;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(a);
        ctx.fillText('?', Math.cos(a) * (this.r + 6), -this.r - 6 + Math.sin(a) * 3);
      }
      ctx.restore();
    }
    // chilled shimmer (slowed, building toward a freeze)
    if (this.chilled > 0 && this.frozen <= 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#bdf0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 3, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // frozen overlay
    if (this.frozen > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#bfeaff';
      roundRectPath(-this.r - 4, -this.r - 4, (this.r + 4) * 2, (this.r + 4) * 2, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#7fd2f5';
      ctx.lineWidth = 2;
      roundRectPath(-this.r - 4, -this.r - 4, (this.r + 4) * 2, (this.r + 4) * 2, 6);
      ctx.stroke();
    }
    ctx.restore();

    // boomerang-in-hand indicators + charge arc
    if (this.boomsInHand > 0) {
      const a = Math.atan2(this.aim[1], this.aim[0]);
      for (let i = 0; i < this.boomsInHand; i++) {
        const off = (i - (this.boomsInHand - 1) / 2) * 0.5;
        const hx = this.x + Math.cos(a + off) * (this.r + 9);
        const hy = this.y + bobY + Math.sin(a + off) * (this.r + 9);
        drawBoomShape(hx, hy, 7, game.time * 6, this.char.dark);
      }
      if (this.charging && this.charge > 0.05) {
        ctx.strokeStyle = `hsl(${lerp(60, 0, this.charge)},100%,60%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y + bobY, this.r + 14, a - this.charge * 1.5, a + this.charge * 1.5);
        ctx.stroke();
      }
    }
    // respawn pip(s)
    for (let i = 0; i < this.respawns.length; i++) {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      ctx.arc(this.x + (i - (this.respawns.length - 1) / 2) * 9, this.y - this.r - 8, 3, 0, TAU * (1 - this.respawns[i] / RESPAWN_TIME));
      ctx.fill();
    }
  }
}

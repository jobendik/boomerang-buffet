import { ctx } from '../core/canvas';
import { audio } from '../core/audio';
import { clamp, dist, lerp, norm, rand, TAU } from '../core/math';
import { BOUNDS, SLASH_RANGE, SLASH_HALF } from '../constants';
import { CHARS, PERSONAS } from '../data/characters';
import { arena, OBSTACLES, SPAWNS } from '../data/arena';
import { POWERS, EXCLUSIVE_GROUPS, type PowerKey } from '../data/powers';
import { drawBoomShape, drawProp, roundRectPath } from '../gfx/shapes';
import { circleRect, resolveCircleObstacles, resolveCrushers, resolveGates, resolvePortals, inPit, nearPit, resolvePitSolids, nudgeFromPits, inBush, blastKnock, resolveBumpers } from '../systems/collision';
import { spawnConfetti, spawnDashPuff, spawnExplosion, spawnFootDust, spawnPopText, spawnRing, spawnSlice } from '../systems/effects';
import { game, kick, pushFeed, roundDecidedBy } from '../game/state';
import { Boomerang } from './Boomerang';
import { Particle } from './Particle';
import { FirePatch } from './FirePatch';
import { IcePatch } from './IcePatch';
import type { Char, Intents, Spawn, Vec2 } from '../types';

/* ----------------------------- tuning constants -------------------------- */
const SLASH_ACTIVE = 0.12; // seconds the blade is "live"
const SLASH_CD = 0.42; // base melee cooldown
const SLASH_CD_FAST = 0.24; // with EXTRA (dual-wield)
const MAX_CURVE = 1.8; // rad/s angular velocity at full charge
const BASE_CURVE = 0.35; // rad/s baseline bank on even an uncharged throw — every
//                          flight arcs out and loops back, the boomerang's signature
//                          (kept gentle so quick flicks fly true where you aim)
const RESPAWN_TIME = 0.9; // delay before a lost boomerang returns to hand
const JUMP_TIME = 0.5; // seconds airborne per hop
const JUMP_H = 30; // peak visual height of a hop
const JUMP_CD = 0.85; // hop cooldown
const SWAT_CD = 0.6; // recovery after a bare-handed (unarmed) swat
const GRIP_GO = 0.0005; // velocity convergence base while pushing off (smaller = snappier)
const GRIP_STOP = 0.00006; // …and while braking to a stop
const STAGGER_CONTROL = 0.16; // share of normal steering kept while knocked off balance
export const SHOVE_SPEED = 520; // knock-back launch speed of a dash tackle
export const SHOVE_STAGGER = 0.42; // seconds a tackled fighter slides before regaining footing

/** The launch numbers for a throw at `charge` (0..1) — one source of truth
 *  for the real throw, the aiming preview and the bots' shot planning. */
export function throwParams(charge: number, weakArm: boolean, big: boolean): { speed: number; outT: number; curve: number } {
  charge = clamp(charge, 0.12, 1);
  return {
    speed: (430 + charge * 230) * (big ? 0.85 : 1), // BIG boomerangs lumber
    // WEAK ARM (anti-power): the boomerang turns back at half the usual range
    outT: (0.42 + charge * 0.4) * (weakArm ? 0.5 : 1),
    // longer hold => tighter loop
    curve: BASE_CURVE + charge * (MAX_CURVE - BASE_CURVE),
  };
}

interface AIState {
  tThink: number; // countdown to the next decision refresh (the bot's "reaction time")
  target: Player | null;
  strafe: number;
  tStrafe: number;
  tThrow: number;
  tkSteer: number; // remaining time a bot keeps piloting a telekinetic throw
  goPower: PowerKey | null;
  dodgeBoom: Boomerang | null; // the incoming throw we last reacted to
  dodgeActive: boolean; // whether we committed to actively dodging dodgeBoom
  dodgeDelayT: number; // reaction latency left before a committed dodge fires
  parryRoll: boolean; // pre-rolled: will we try to slash-parry dodgeBoom?
  aimErr: number; // current aim error (radians), resampled each decision tick
  meleeT: number; // point-blank slash windup countdown (-1 = not armed)
  range: number; // preferred fighting distance — per-bot personality
  recState: number; // knock-back recovery: 0 undecided · 1 will react · -1 too dazed
  recT: number; // reaction latency before the recovery fires
  shoveT: number; // cooldown between tackle considerations
  tackleT: number; // committed to a tackle run-up for this long
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
  ghostKills: number; // kills landed after you're dead    -> "Vengeful Ghost"
  distance: number; // total ground covered (px)           -> "Most Enthusiastic"
  switches: number; // floor switches stepped on           -> "Switcheroo"
  shoves: number; // dash-tackles landed                   -> "Bumper Car"
  ringOuts: number; // foes shoved/blasted into a hazard   -> "Sumo Champion"
  trickKills: number; // kills that earned a callout       -> "Trick Shot Artist"
  style: number; // cumulative style points from callouts
  rallyKills: number; // kills with a parried boomerang    -> "Return to Sender"
  bestRally: number; // longest parry rally taken part in  -> "Hot Potato"
  boomClashes: number; // mid-air boomerang collisions     -> "Air Traffic Control"
  slashClashes: number; // blade-on-blade clashes          -> "En Garde"
  closeCalls: number; // lethal throws that barely missed  -> "Teflon"
  recoveries: number; // shoves survived at a pit's lip    -> "Cliffhanger"
  haunts: number; // ghost gusts unleashed after death     -> "Poltergeist"
  selfKills: number; // deaths with nobody else to blame   -> "Own Worst Enemy"
  roundsWon: number; // rounds taken
  killsThisRound: number; // reset each round (for the pacifist award)
  pacifistWins: number; // rounds won without a kill       -> "Pacifist"
}

/** What finished a fighter off — picks the kill-feed glyph. */
export type KillCause = 'boom' | 'slash' | 'bomb' | 'burn' | 'pit' | 'crush' | 'ring' | 'squash' | 'shatter';

/** Optional context for `Player.die`. */
export interface DeathOpts {
  /** Environmental deaths (pits, crushers, the ring) bypass DELAYED DEATH. */
  env?: boolean;
  /** Overrides the floating word shown at the death site. */
  pop?: string;
  /** Death sound flavour (frozen fighters always shatter). */
  sfx?: 'slice' | 'crush' | 'silent';
  /** Trick-shot callout earned by the killer ("BANK SHOT!", "DUNKED!" …). */
  tag?: string;
  /** Style points banked with the callout. */
  style?: number;
  cause?: KillCause;
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
  airT!: number; // remaining airborne (jump) time — immune & passes over foes
  airCd!: number; // jump cooldown
  jumpZ!: number; // current visual height off the ground while airborne
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
  moveK!: number; // 0 idle … 1 running, smoothed (drives the walk wobble)
  dustT!: number; // footstep dust cadence
  ghostT!: number; // dash afterimage cadence
  streak!: number; // kills chained inside the streak window
  streakT!: number; // remaining streak window
  swingDir!: number; // which way the next melee swing sweeps (alternates)
  squashT!: number; // landing/dash squash timer (visual)
  disguised!: boolean; // DISGUISE: held still long enough to look like scenery
  disguiseT!: number; // seconds of stillness accumulated toward disguising
  propIdx!: number; // which scenery prop we currently masquerade as
  inBush!: boolean; // standing in leafy cover this frame (bots can't see you)
  role!: 'seeker' | 'hider' | 'none'; // Hide & Seek assignment
  attemptsLeft!: number; // Hide & Seek: seeker's finite pool of throws/slashes
  dyingTimer!: number; // DELAYED DEATH: seconds of borrowed time after a lethal hit
  dyingKiller!: Player | null; // who gets the kill once the reprieve runs out
  dyingDx!: number; // death knock-back direction, replayed when it finalises
  dyingDy!: number;
  dyingOpts!: DeathOpts; // the original blow's context, replayed with it
  stagger!: number; // seconds of knocked-off-balance (momentum rules, steering is weak)
  lastHitBy!: Player | null; // who last shoved/blasted us — earns the credit if we then
  lastHitT!: number; //          fall, get squished or burn within this window
  shoveLock!: boolean; // this dash already landed its tackle
  slashAge!: number; // seconds since our last swing began (the blade-clash window)
  swat!: boolean; // the current swing is a bare-handed swat (parries only, can't kill)
  throwT!: number; // follow-through pose timer after releasing a throw (visual)
  catchT!: number; // snag pose timer after a catch (visual)
  cheerT!: number; // remaining seconds of post-kill gloating (visual)
  flinchT!: number; // remaining seconds of a startled face after a near miss (visual)
  lipT!: number; // seconds spent staggering right at a pit's lip (cliffhanger credit)
  // dead fighters linger as mischievous ghosts (see `updateGhost`)
  gx!: number;
  gy!: number;
  gvx!: number;
  gvy!: number;
  booCd!: number;
  booT!: number; // visual pulse after a gust

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
      ghostKills: 0,
      distance: 0,
      switches: 0,
      shoves: 0,
      ringOuts: 0,
      trickKills: 0,
      style: 0,
      rallyKills: 0,
      bestRally: 0,
      boomClashes: 0,
      slashClashes: 0,
      closeCalls: 0,
      recoveries: 0,
      haunts: 0,
      selfKills: 0,
      roundsWon: 0,
      killsThisRound: 0,
      pacifistWins: 0,
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
      dodgeBoom: null,
      dodgeActive: false,
      dodgeDelayT: 0,
      parryRoll: false,
      aimErr: 0,
      meleeT: -1,
      // each bot keeps its own spacing, drawn from its fighter's temperament
      range: rand(PERSONAS[this.char.persona].range[0], PERSONAS[this.char.persona].range[1]),
      recState: 0,
      recT: 0,
      shoveT: 0,
      tackleT: 0,
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
    this.airT = 0;
    this.airCd = 0;
    this.jumpZ = 0;
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
    this.moveK = 0;
    this.dustT = 0;
    this.ghostT = 0;
    this.streak = 0;
    this.streakT = 0;
    this.swingDir = 1;
    this.squashT = 0;
    this.disguised = false;
    this.disguiseT = 0;
    this.propIdx = 0;
    this.inBush = false;
    this.role = 'none';
    this.attemptsLeft = 0;
    this.dyingTimer = 0;
    this.dyingKiller = null;
    this.dyingDx = 0;
    this.dyingDy = 0;
    this.dyingOpts = {};
    this.stagger = 0;
    this.lastHitBy = null;
    this.lastHitT = 0;
    this.shoveLock = false;
    this.slashAge = 9;
    this.swat = false;
    this.throwT = 0;
    this.catchT = 0;
    this.cheerT = 0;
    this.flinchT = 0;
    this.lipT = 0;
    this.gx = sp.x;
    this.gy = sp.y;
    this.gvx = 0;
    this.gvy = 0;
    this.booCd = 1.2;
    this.booT = 0;
    this.stats.killsThisRound = 0;
    this.powers.clear(); // modifiers are lost on death / new round
  }

  get hasBoomerang(): boolean {
    return this.boomsInHand > 0;
  }
  /** Armed = holding at least one boomerang (can throw & slash). */
  get armed(): boolean {
    return this.boomsInHand > 0;
  }
  /** Mid-jump: lifted off the ground, so ground threats pass harmlessly under. */
  get airborne(): boolean {
    return this.airT > 0;
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
    // BATTLE ROYALE triggers a level-wide event rather than a kept modifier: a
    // safe circle centred on the grab point that closes in, purging foes left
    // outside it. (Re)starts the event centred where we're standing.
    if (type === 'BATTLE') {
      const cx = clamp(this.x, BOUNDS.l + 90, BOUNDS.r - 90);
      const cy = clamp(this.y, BOUNDS.t + 90, BOUNDS.b - 90);
      game.br = { cx, cy, r: 1300, rStart: 1300, rMin: 118, initiator: this, t: 0, shrink: 8.5, dur: 13 };
      spawnRing(cx, cy, POWERS.BATTLE.color, 2.2);
      audio.sudden(); // the ring closing in is a threat, not a treat
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
    if (this.burning <= 0) audio.ignite();
    this.burning = Math.max(this.burning, 1.7);
    // an ownerless flame (sudden death, a stray patch) belongs to whoever
    // just knocked us into it
    if (!source && this.lastHitT > 0 && this.lastHitBy) source = this.lastHitBy;
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
    if (this.stagger > 0) this.stagger = Math.max(0, this.stagger - dt);
    if (this.lastHitT > 0) {
      this.lastHitT -= dt;
      if (this.lastHitT <= 0) this.lastHitBy = null;
    }
    this.slashAge += dt;
    this.throwT = Math.max(0, this.throwT - dt);
    this.catchT = Math.max(0, this.catchT - dt);
    this.cheerT = Math.max(0, this.cheerT - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) this.streak = 0;
    }

    // JUMP / vertical dodge: while airborne, rise on a parabolic arc and stay
    // untouchable (we top up invuln, so every existing damage guard skips us —
    // boomerangs, slashes, fire, blasts and grounded foes all pass underneath).
    this.airCd = Math.max(0, this.airCd - dt);
    if (this.airT > 0) {
      this.airT = Math.max(0, this.airT - dt);
      this.jumpZ = Math.sin((1 - this.airT / JUMP_TIME) * Math.PI) * JUMP_H;
      this.invuln = Math.max(this.invuln, this.airT + 0.04);
      if (this.airT <= 0) {
        this.jumpZ = 0;
        this.invuln = Math.max(this.invuln, 0.12); // brief landing grace
        this.squashT = 0.18; // touchdown squash
        audio.land();
        spawnDashPuff(this.x, this.y, this.aim, this.char.body); // touchdown puff
      }
    }

    // DELAYED DEATH: living on borrowed time after a lethal hit. The fighter
    // keeps playing for the duration, then the death finalises (DELAYED was
    // already spent in die(), so this second call goes through for real).
    if (this.dyingTimer > 0) {
      this.dyingTimer -= dt;
      if (Math.random() < 0.85) {
        game.particles.push(
          new Particle(this.x + rand(-9, 9), this.y + rand(-11, 5), rand(-14, 14), rand(-46, -16), rand(0.25, 0.5), Math.random() < 0.5 ? '#c9b8ff' : '#ff5d6c', rand(2, 4))
        );
      }
      if (this.dyingTimer <= 0) {
        this.die(this.dyingKiller, this.dyingDx, this.dyingDy, this.dyingOpts);
        return;
      }
    }

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
        this.die(src, dir[0], dir[1], { pop: 'TOASTED!', cause: 'burn', ...this.envCredit(src, 'ROASTED!') });
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
      const moving = !!(mx || my);
      const goal = moving ? [target[0] * baseSpeed, target[1] * baseSpeed] : [0, 0];
      // slick (icy) arenas converge far slower — momentum carries you around.
      // On dry floor, planting your feet bites harder than pushing off: stops
      // are crisp (precise spacing) while starts keep a hint of weight.
      const grip = arena.slick && !this.airborne ? 0.16 : moving ? GRIP_GO : GRIP_STOP;
      let k = 1 - Math.pow(grip, dt);
      // knocked off balance: momentum rules, steering barely registers
      if (this.stagger > 0) k *= STAGGER_CONTROL;
      this.vx = lerp(this.vx, goal[0], k);
      this.vy = lerp(this.vy, goal[1], k);
    }

    // walk-cycle blend + footstep dust while running on the ground
    const runSpeed = Math.hypot(this.vx, this.vy);
    this.moveK = lerp(this.moveK, runSpeed > 60 ? 1 : 0, 1 - Math.pow(0.001, dt));
    if (this.squashT > 0) this.squashT = Math.max(0, this.squashT - dt);
    this.dustT -= dt;
    if (runSpeed > 170 && !this.airborne && this.dashT <= 0 && this.dustT <= 0) {
      this.dustT = 0.16;
      audio.step();
      spawnFootDust(this.x, this.y + this.r * 0.8);
    }

    // frozen fighters mash dash to crack the ice apart and break free early
    if (frozen && intents.dash) {
      this.frozen = Math.max(0, this.frozen - 0.32);
      if (Math.random() < 0.4) audio.crack();
      if (this.frozen <= 0) spawnRing(this.x, this.y, '#bdf0ff', 1.0);
    }

    // jump / vertical dodge trigger — a dedicated evade (no offence mid-air)
    if (!frozen && intents.jump && this.airT <= 0 && this.airCd <= 0 && this.dashT <= 0) {
      this.airT = JUMP_TIME;
      this.airCd = JUMP_CD;
      this.invuln = Math.max(this.invuln, JUMP_TIME);
      audio.jump();
      spawnDashPuff(this.x, this.y, this.aim, this.char.body);
    }

    // dash / teleport trigger
    if (!frozen && intents.dash && this.dashCd <= 0 && this.dashT <= 0 && this.airT <= 0) {
      if (this.powers.has('TELEPORT') && this.tryTeleport()) {
        // teleported to an airborne boomerang
      } else {
        const d: Vec2 = intents.move[0] || intents.move[1] ? norm(intents.move[0], intents.move[1]) : this.aim;
        this.vx = d[0] * 660;
        this.vy = d[1] * 660;
        this.dashT = 0.17;
        this.shoveLock = false;
        this.stagger = 0; // a dash is the recovery tech: it cancels a knock-back outright
        this.dashCd = caffeinated ? 0.22 : 0.7; // Caffeinated greatly cuts dash cooldown
        this.invuln = Math.max(this.invuln, 0.26);
        this.squashT = 0.16; // a kick of stretch as the dash fires
        audio.dash();
        spawnDashPuff(this.x, this.y, d, this.char.body);
        // DECOY: leave a look-alike clone behind at the spot we just bolted from
        if (this.powers.has('DECOY')) this.spawnDecoy(d);
      }
      // a quick dash beats out flames (Caffeine's reset enables rapid stomping)
      if (this.burning > 0) {
        this.burning = 0;
        spawnRing(this.x, this.y, '#9fd6ff', 0.8);
      }
      this.stats.dashes++;
    }

    // slash trigger. ARMED, it's the blade: kills up close and parries
    // boomerangs. UNARMED, the same button is a bare-handed SWAT — it can't
    // hurt anyone, but a well-timed one still bats a boomerang away (a
    // narrower arc and a longer recovery make it the riskier parry). That's
    // what lets a rally run: thrower and parrier trading an ever-faster
    // boomerang until somebody's timing cracks.
    // A Hide & Seek seeker may only swing while attempts remain; hiders can't.
    if (!frozen && !this.airborne && intents.slash && !this.armed && !this.isHider && this.slashCd <= 0 && this.slashT <= 0) {
      this.slashT = SLASH_ACTIVE;
      this.slashAge = 0;
      this.swat = true;
      this.slashCd = SWAT_CD;
      this.swingDir = -this.swingDir;
      audio.swat();
    } else if (!frozen && !this.airborne && intents.slash && this.armed && this.slashCd <= 0 && this.slashT <= 0 && (!this.isSeeker || this.attemptsLeft > 0)) {
      if (this.isSeeker) this.attemptsLeft--;
      this.slashT = SLASH_ACTIVE;
      this.slashAge = 0;
      this.swat = false;
      this.slashCd = this.powers.has('EXTRA') ? SLASH_CD_FAST : SLASH_CD;
      this.swingDir = -this.swingDir; // alternate forehand/backhand swings
      // STAB lunges the fighter forward on the swing — an aggressive gap-closer.
      if (this.powers.has('STAB')) {
        this.vx = this.aim[0] * 560;
        this.vy = this.aim[1] * 560;
        this.dashT = Math.max(this.dashT, 0.13);
        this.invuln = Math.max(this.invuln, 0.1);
        spawnDashPuff(this.x, this.y, this.aim, POWERS.STAB.color);
      }
      audio.slash();
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

    // friction during dash decay + a trail of translucent afterimages
    if (this.dashT > 0) {
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.045;
        const g = new Particle(this.x, this.y, 0, 0, 0.26, this.char.body, this.r, 'ghost');
        g.char = this.char;
        g.aimV = [this.aim[0], this.aim[1]];
        game.particles.push(g);
      }
    } else {
      this.ghostT = 0;
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
    // PHASE DASH: ignore the solid obstacle layer (static walls + closed gates)
    // for the duration of a dash, letting the fighter slip clean through (map
    // bounds & crushers still stop them). On a stalled dash that ends mid-wall,
    // the next frame's resolve simply pops them out the nearer side.
    if (!(this.dashT > 0 && this.powers.has('PHASE'))) {
      resolveCircleObstacles(this);
      resolveGates(this);
    }
    resolveBumpers(this); // spring posts ping anyone arriving at speed
    resolveCrushers(this); // crushing blocks are solid walls while at rest/moving
    resolvePortals(this, dt);

    // bottomless pits, modulated by the Fall-Protection accessibility setting.
    if (game.fallProtect === 2) {
      // Extreme: pits act as solid walls — entry is simply impossible.
      resolvePitSolids(this);
    } else {
      // Gentle: nudge the player back from the lip (danger softened, not gone).
      if (game.fallProtect === 1) nudgeFromPits(this, dt);
      // A grounded fighter who stops over a pit falls out; dashing or hopping leaps it.
      if (this.dashT <= 0 && !this.airborne && inPit(this.x, this.y)) {
        this.fall();
        return;
      }
      // "Cliffhanger": knocked right to a pit's lip and still standing after
      if (this.stagger > 0 && nearPit(this.x, this.y, 30)) this.lipT += dt;
      else if (this.lipT > 0) {
        if (this.lipT > 0.08 && this.stagger <= 0.02) {
          this.stats.recoveries++;
          spawnPopText(this.x, this.y - this.r - 8, 'PHEW!', '#9fd6ff', 15);
        }
        this.lipT = 0;
      }
    }

    // leafy cover: lurking in a bush hides you from bots and earns "Rambo"
    this.inBush = inBush(this.x, this.y);
    if (this.inBush) this.stats.bushTime += dt;

    // ground covered, for "Most Enthusiastic" (velocity-based, so instantaneous
    // teleport/portal jumps don't inflate it)
    this.stats.distance += Math.hypot(this.vx, this.vy) * dt;

    // throw handling (no throwing mid-hop — a jump is a pure evade)
    const telekinetic = this.powers.has('TELEKINESIS');
    if (this.ai.tkSteer > 0) this.ai.tkSteer = Math.max(0, this.ai.tkSteer - dt);
    if (!frozen && !this.airborne) {
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
          const before = this.charge;
          this.charge = clamp(this.charge + dt / 0.55, 0, 1);
          // fully wound: a quick ping so max charge is felt, not watched for
          if (before < 1 && this.charge >= 1) {
            spawnRing(this.x, this.y, '#ffd23a', 0.7);
            audio.charge();
          }
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
      const acting = !!(intents.slash || intents.dash || intents.jump || intents.throwNow || intents.throwHeld) || this.charging || this.slashT > 0 || this.dashT > 0 || this.airT > 0;
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
    audio.warp();
    // squash-kill: warping straight onto a foe crushes them flat
    for (const q of game.players) {
      if (!q.alive || q.invuln > 0 || !this.isEnemy(q)) continue;
      if (dist(this.x, this.y, q.x, q.y) < this.r + q.r) {
        const [dx, dy] = norm(q.x - this.x, q.y - this.y);
        q.die(this, dx, dy, { pop: 'SQUASHED!', cause: 'squash', tag: 'TELEFRAG!', style: 3 });
      }
    }
    return true;
  }

  /** DECOY: drop a look-alike clone at our current spot as we dash clear. It
   *  mimics our character, aim and boomerang count to bait the bots; capped at
   *  two live clones per fighter so the field can't flood with phantoms. */
  private spawnDecoy(dir: Vec2): void {
    let mine = 0;
    for (const d of game.decoys) if (d.ownerIdx === this.idx) mine++;
    if (mine >= 2) return;
    const ttl = 3.5;
    game.decoys.push({
      x: this.x,
      y: this.y,
      vx: dir[0] * 130, // a brief drift so the clone "peels off" before settling
      vy: dir[1] * 130,
      charIdx: this.charIdx,
      aim: [this.aim[0], this.aim[1]],
      booms: this.boomsInHand,
      team: this.team,
      ownerIdx: this.idx,
      life: ttl,
      ttl,
      bob: rand(0, TAU),
    });
    spawnRing(this.x, this.y, POWERS.DECOY.color, 1.0);
  }

  doThrow(charge: number): void {
    // Hide & Seek seeker: each throw spends one of a finite pool of attempts.
    if (this.isSeeker) {
      if (this.attemptsLeft <= 0) return;
      this.attemptsLeft--;
    }
    charge = clamp(charge, 0.12, 1);
    const [ax, ay] = this.aim;
    // (BIG's lumbering is applied by the boomerang itself as it flies)
    const tp = throwParams(charge, this.powers.has('WEAKARM'), false);
    // sideways momentum picks which way it banks
    const main = new Boomerang(this, ax * tp.speed, ay * tp.speed, tp.outT, true);
    main.curve = tp.curve * this.curveSide();
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
    this.throwT = 0.22;
    audio.throw_(charge);
  }

  /** Which way a throw banks: strafing sideways relative to your aim carries
   *  that momentum into the curve (move left of aim → bank left), so the arc
   *  is player-steerable. Standing still keeps the classic clockwise loop. */
  curveSide(): number {
    const cross = this.aim[0] * this.vy - this.aim[1] * this.vx;
    return Math.hypot(this.vx, this.vy) > 40 && Math.abs(cross) > 30 ? Math.sign(cross) : 1;
  }

  /** A boomerang of ours left play uncaught — schedule its return to hand. */
  loseBoomerang(): void {
    this.respawns.push(RESPAWN_TIME);
  }

  catchBoomerang(): void {
    this.boomsInHand = Math.min(this.boomsMax, this.boomsInHand + 1);
    audio.catch_();
    spawnRing(this.x, this.y, this.char.body, 0.9);
    game.shake = Math.max(game.shake, 3); // a satisfying little thunk on the catch
    this.squashT = 0.15; // the body absorbs the snag with a quick squash
    this.catchT = 0.25;
  }

  /**
   * Knock this fighter off balance: launch them along (dx, dy) and leave them
   * sliding for `stagger` seconds with only a sliver of steering. `by` earns
   * the credit if the slide ends in a pit, a crusher or the flames. A dash
   * (or a hop over the danger) is the way out — see `update`.
   */
  knock(dx: number, dy: number, speed: number, stagger: number, by: Player | null): void {
    if (!this.alive) return;
    const [nx, ny] = norm(dx, dy);
    this.vx = nx * speed;
    this.vy = ny * speed;
    this.dashT = 0;
    this.stagger = Math.max(this.stagger, stagger);
    this.squashT = 0.18;
    // being bowled over spoils a wind-up: the charge is lost
    this.charging = false;
    this.charge = 0;
    if (by && by !== this && by.isEnemy(this)) {
      this.lastHitBy = by;
      this.lastHitT = 3;
    }
  }

  /** If a rival knocked us about moments ago, an otherwise ownerless death
   *  (pit, crusher, flames) is theirs — with a callout for the ring-out. */
  private envCredit(known: Player | null, tag: string): DeathOpts {
    const by = this.lastHitBy;
    if (!by || this.lastHitT <= 0 || (known && known !== by)) return {};
    return { tag, style: 3 };
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
    audio.fall(); // slide-whistle into the void — no chop, they're simply gone
    // route through die() for the shared bookkeeping (death count, GHOST, etc.).
    // Flagged environmental: a pit ignores DELAYED DEATH (you're simply gone).
    // Whoever knocked us in (if anyone, recently) takes the credit.
    const by = this.lastHitT > 0 ? this.lastHitBy : null;
    this.die(by, 0, 0, { env: true, pop: 'GONE!', sfx: 'silent', cause: 'pit', ...this.envCredit(null, 'DUNKED!') });
  }

  /** Squished by a kinematic block — an environmental death, no killer. */
  crush(): void {
    if (!this.alive || this.invuln > 0) return;
    game.shake = Math.max(game.shake, 16);
    const by = this.lastHitT > 0 ? this.lastHitBy : null;
    // environmental: Shield still saves, DELAYED doesn't
    this.die(by, 0, -1, { env: true, pop: 'CRUSHED!', sfx: 'crush', cause: 'crush', ...this.envCredit(null, 'PANCAKED!') });
    if (!this.alive) this.stats.crushDeaths++; // count only an actual squish
  }

  /** The one way out. See `DeathOpts` for the optional context. */
  die(killer: Player | null, dirx: number, diry: number, o: DeathOpts = {}): void {
    if (!this.alive) return;
    const environmental = !!o.env;
    const deathSfx = o.sfx ?? 'slice';
    const pop = o.pop;
    // Shield intercepts the next lethal hit instead of dying (a bubble is no
    // parachute, though: the void takes you regardless).
    if (this.powers.has('SHIELD') && o.cause !== 'pit') {
      this.powers.delete('SHIELD');
      this.invuln = Math.max(this.invuln, 0.6);
      this.shieldFlash = 0.4;
      audio.shield();
      spawnRing(this.x, this.y, POWERS.SHIELD.color, 1.3);
      return;
    }
    // DELAYED DEATH: a lethal hit (boomerang/fire/explosion — but not a pit or
    // crusher) doesn't finalise for ~2s. We stay alive and fully functional;
    // the death is replayed from update() once the borrowed time runs out. The
    // power is spent here so that second call falls straight through to dying.
    if (!environmental && this.dyingTimer <= 0 && this.powers.has('DELAYED')) {
      this.powers.delete('DELAYED');
      this.dyingTimer = 2;
      this.dyingKiller = killer;
      this.dyingDx = dirx;
      this.dyingDy = diry;
      this.dyingOpts = o;
      audio.heartbeat(); // borrowed time starts pounding
      spawnRing(this.x, this.y, POWERS.DELAYED.color, 1.2);
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
    // the departed linger as ghosts, drifting up from where they fell
    this.gx = this.x;
    this.gy = this.y;
    this.gvx = 0;
    this.gvy = 0;
    this.booCd = 1.6;
    if (!killer || killer === this) this.stats.selfKills++;
    if (killer && killer !== this) {
      killer.stats.kills++;
      killer.stats.killsThisRound++;
      killer.cheerT = 1.1;
      // kill-streak fanfare: kills chained inside the window escalate the pop
      killer.streak = killer.streakT > 0 ? killer.streak + 1 : 1;
      killer.streakT = 2.2;
      if (killer.alive && killer.streak >= 2) {
        const label = killer.streak === 2 ? 'DOUBLE KILL!' : killer.streak === 3 ? 'TRIPLE KILL!' : 'RAMPAGE!';
        spawnPopText(killer.x, killer.y - killer.r - 14, label, '#ffd23a', 18 + killer.streak * 2);
        spawnConfetti(killer.x, killer.y - 20, 4 + killer.streak * 3);
        audio.streak(killer.streak);
      }
      if (wasFrozen) killer.stats.frozenKills++; // "Ice Breaker"
      if (killer.bamboozled > 0) killer.stats.bamboozledKills++; // "Drunken Master"
      // a kill landed by a dead fighter (their boomerang/bomb/Last Laugh blast
      // outliving them, or a ghostly gust) is the work of a "Vengeful Ghost"
      if (!killer.alive) killer.stats.ghostKills++;
      if (o.cause === 'pit' || o.cause === 'crush' || (o.cause === 'burn' && o.tag)) killer.stats.ringOuts++;
    }
    // trick-shot callout: a second, golden pop above the death word, a line in
    // the kill feed and style points toward the end-of-match awards
    let tag = o.tag;
    if (killer && killer !== this && !killer.alive && !tag) tag = 'FROM THE GRAVE!';
    if (tag && killer && killer !== this) {
      killer.stats.trickKills++;
      killer.stats.style += o.style ?? 1;
      spawnPopText(this.x, this.y - 26, tag, '#ffd23a', 22);
      spawnConfetti(this.x, this.y - 30, 6);
      audio.trick();
    }
    pushFeed(killer && killer !== this ? killer : null, this, o.cause ?? 'boom', tag);
    this.burning = 0;
    this.frozen = 0;
    this.stagger = 0;
    if (wasFrozen) audio.shatter();
    else if (deathSfx === 'crush') audio.crush();
    else if (deathSfx !== 'silent') audio.slice();
    audio.yelp(this.charIdx);
    spawnSlice(this.x, this.y, this.char, dirx, diry);
    spawnPopText(this.x, this.y, pop ?? (wasFrozen ? 'SHATTERED!' : 'SLICED!'), wasFrozen ? '#bdf0ff' : '#fff3df');
    if (wasFrozen) spawnRing(this.x, this.y, '#bdf0ff', 1.3); // the ice block shatters
    game.shake = Math.max(game.shake, 14);
    kick(dirx, diry, 10); // the camera lurches along the blow
    game.hitstop = Math.max(game.hitstop, 0.09);

    // cinematic beats: EVERY slice gets a micro slow-mo so the two halves are
    // seen tumbling apart; a round-deciding kill or a Golden-carrier kill
    // stretches the moment further (the blueprint's time-dilation)
    if (game.state === 'playing') {
      game.slowmo = Math.max(game.slowmo, 0.28);
      if (roundDecidedBy(this)) {
        game.slowmo = Math.max(game.slowmo, 0.85);
        audio.bigkill(); // deep sub-drop under the round-deciding slice
        // the finishing blow gets the camera's full attention
        const fx = killer && killer.alive ? (this.x + killer.x) / 2 : this.x;
        const fy = killer && killer.alive ? (this.y + killer.y) / 2 : this.y;
        game.cam.focusX = fx;
        game.cam.focusY = fy;
        game.cam.punch = 1;
      }
      if (killer && killer.isGoldCarrier) game.slowmo = Math.max(game.slowmo, 0.6);
    }

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
          q.die(this, dx, dy, { pop: 'KABOOM!', cause: 'bomb', tag: 'LAST LAUGH!', style: 2 });
        }
      }
      blastKnock(this.x, this.y, R, this);
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
    // shadow — stays grounded but shrinks & fades as the fighter hops upward
    const zk = this.jumpZ / JUMP_H; // 0 grounded … 1 at apex
    ctx.fillStyle = `rgba(0,0,0,${0.28 - zk * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.r * 0.95, this.r * 0.9 * (1 - zk * 0.4), this.r * 0.42 * (1 - zk * 0.4), 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y + bobY - this.jumpZ);

    // body language: spawn pop-in, dash/land squash, and a jaunty run wobble
    const grow = 1 - this.spawnFlash / 0.6; // 0 just spawned … 1 settled
    const popScale = Math.min(1, 0.4 + grow * 0.6) + Math.sin(Math.min(1, grow) * Math.PI) * 0.14;
    const sq = this.squashT > 0 ? this.squashT / 0.18 : 0;
    ctx.rotate(Math.sin(this.bob * 1.35) * 0.055 * this.moveK);
    ctx.scale(popScale * (1 + sq * 0.16), popScale * (1 - sq * 0.18));

    // wind-up body language: lean back while charging a throw, and tremble
    // with barely-contained power once the charge is full
    if (this.charging && this.charge > 0.1) {
      ctx.translate(-this.aim[0] * this.charge * 3, -this.aim[1] * this.charge * 3);
      ctx.rotate(-this.aim[0] * this.charge * 0.06);
      if (this.charge >= 1) ctx.translate(rand(-0.8, 0.8), rand(-0.8, 0.8));
    }
    // frozen solid: shivering inside the ice block
    if (this.frozen > 0) ctx.translate(Math.sin(game.time * 38) * 1.1, 0);

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
    // invuln flicker (suppressed mid-hop — the raised sprite reads as airborne)
    if (this.invuln > 0 && this.airT <= 0 && Math.floor(game.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;
    // lurking in foliage fades the fighter into the leaves
    if (this.inBush) ctx.globalAlpha *= 0.45;

    this.char.draw(this.char, this.r, this.aim);

    // melee swing: the boomerang itself sweeps across the slash arc like a
    // knife — wind-up edge to follow-through — trailing a fading swoosh
    if (this.slashT > 0) {
      const a = Math.atan2(this.aim[1], this.aim[0]);
      const k = 1 - this.slashT / SLASH_ACTIVE; // 0 wind-up → 1 follow-through
      const fade = this.slashT / SLASH_ACTIVE;
      const sweep = SLASH_HALF * 1.5;
      const start = a - this.swingDir * sweep;
      const blade = start + this.swingDir * sweep * 2 * k; // blade's current angle
      const rad = this.r + SLASH_RANGE * 0.7;
      ctx.save();
      ctx.lineCap = 'round';
      // the swoosh swept out so far, brightest along the blade's wake
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * fade})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, rad, start, blade, this.swingDir < 0);
      ctx.stroke();
      ctx.strokeStyle = `rgba(180,240,255,${0.45 * fade})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, rad + 4, start, blade, this.swingDir < 0);
      ctx.stroke();
      // the blade: our own boomerang, spinning hard as it's swung through
      drawBoomShape(Math.cos(blade) * rad, Math.sin(blade) * rad, 10, blade + k * 9, this.char.dark);
      ctx.restore();
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

    // boomerang-in-hand indicators + charge arc (ride up with the hop).
    // While slashing, one boomerang is busy being swung — don't double-draw it.
    if (this.boomsInHand > 0) {
      const hbY = this.y + bobY - this.jumpZ;
      const a = Math.atan2(this.aim[1], this.aim[0]);
      const shown = this.slashT > 0 ? this.boomsInHand - 1 : this.boomsInHand;
      // melee-windup telegraph: a bot about to swing cocks its boomerang high
      // behind its shoulder, spinning fast and flashing white — the readable
      // "get out of the way" cue that makes the windup mechanic fair
      const windup = this.isAI && this.ai.meleeT > 0 && this.slashT <= 0;
      for (let i = windup ? 1 : 0; i < shown; i++) {
        const off = (i - (shown - 1) / 2) * 0.5;
        const hx = this.x + Math.cos(a + off) * (this.r + 9);
        const hy = hbY + Math.sin(a + off) * (this.r + 9);
        drawBoomShape(hx, hy, 7, game.time * 6, this.char.dark);
      }
      if (windup && shown > 0) {
        const wob = Math.sin(game.time * 24) * 0.12;
        const wx = this.x + Math.cos(a - 1.15 + wob) * (this.r + 12);
        const wy = hbY + Math.sin(a - 1.15 + wob) * (this.r + 12);
        drawBoomShape(wx, wy, 10, game.time * 16, Math.floor(game.time * 16) % 2 ? '#fff' : this.char.dark);
      }
      if (this.charging && this.charge > 0.05) {
        ctx.strokeStyle = `hsl(${lerp(60, 0, this.charge)},100%,60%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, hbY, this.r + 14, a - this.charge * 1.5, a + this.charge * 1.5);
        ctx.stroke();
      }
      // human-only: dotted flight preview while charging, so banked curve
      // throws are aimable instead of guesswork
      if (!this.isAI && this.charging && this.charge > 0.04) this.drawThrowPreview();
    }
    // respawn pip(s)
    for (let i = 0; i < this.respawns.length; i++) {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      ctx.arc(this.x + (i - (this.respawns.length - 1) / 2) * 9, this.y - this.r - 8, 3, 0, TAU * (1 - this.respawns[i] / RESPAWN_TIME));
      ctx.fill();
    }
  }

  /** Simulate the charged throw with the live flight maths and dot its path,
   *  stopping at the first wall/obstacle the boomerang would bounce off. */
  private drawThrowPreview(): void {
    const charge = clamp(this.charge, 0.12, 1);
    const speed = (430 + charge * 230) * (this.powers.has('BIG') ? 0.85 : 1);
    let outT = (0.42 + charge * 0.4) * (this.powers.has('WEAKARM') ? 0.5 : 1);
    // mirror doThrow's bank-side choice so the dots always tell the truth
    const curve = this.powers.has('TELEKINESIS') ? 0 : (BASE_CURVE + charge * (MAX_CURVE - BASE_CURVE)) * this.curveSide();
    let px = this.x + this.aim[0] * (this.r + 6);
    let py = this.y + this.aim[1] * (this.r + 6);
    let vx = this.aim[0] * speed;
    let vy = this.aim[1] * speed;
    const step = 1 / 50;
    const solids = game.gates.length ? [...OBSTACLES, ...game.gates.filter((g) => !g.open)] : OBSTACLES;
    ctx.save();
    const hue = lerp(60, 0, charge);
    let i = 0;
    let blocked = false;
    while (outT > 0 && !blocked) {
      const c = Math.cos(curve * step);
      const s = Math.sin(curve * step);
      const nvx = vx * c - vy * s;
      vy = vx * s + vy * c;
      vx = nvx;
      px += vx * step;
      py += vy * step;
      outT -= step;
      if (px < BOUNDS.l + 11 || px > BOUNDS.r - 11 || py < BOUNDS.t + 11 || py > BOUNDS.b - 11) blocked = true;
      else {
        for (const R of solids) {
          if (circleRect(px, py, 11, R).hit) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked && i % 2 === 0) {
        const fade = 0.5 - i * 0.006;
        if (fade > 0.08) {
          ctx.fillStyle = `hsla(${hue},100%,68%,${fade})`;
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, TAU);
          ctx.fill();
        }
      }
      i++;
    }
    // terminus marker: bounce point or the turn-back apex
    ctx.strokeStyle = `hsla(${hue},100%,70%,.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, blocked ? 5 : 7, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

# 🥑 Boomerang Buffet

An original arena brawler homage to the boomerang party-fighter genre. Cute food
fighters fling returning boomerangs that bounce off walls and slice opponents.
Grab power-ups, dash, and parry — last snack standing wins the round.

Built with **Vite** + **TypeScript** + Canvas 2D. No game-art or audio assets:
every fighter is procedural vector art and every sound is a tiny WebAudio synth.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (opens the browser)
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
npm run typecheck
```

## Controls

| Action | Input |
| ------ | ----- |
| Move   | `WASD` / Arrow keys |
| Aim    | Mouse |
| Throw  | Left-Click — **hold to charge & bank the curve** |
| Slash  | Right-Click / `E` — melee kill **and** clash/parry incoming boomerangs |
| Dash / Warp | `Space` (with **Warp** power, dash teleports you to your airborne boomerang) |
| Mute   | `M` |

## Core mechanics (modelled on *Boomerang Fu*)

- **Armed / Unarmed state machine** — slashing requires holding a boomerang. The
  instant you throw, you're *unarmed* and can only dash to survive until it
  returns. Slashing is also faster than throwing, so it wins point-blank trades.
- **Clash / parry** — a well-timed slash deflects an incoming boomerang straight
  back at its owner.
- **Charged curve throws** — tap to throw straight; hold to bank the flight path
  into an arc (max charge nearly orbits).
- **Stackable power-ups** — modifiers accumulate and combine, persisting until
  death: `Fire` (sets foes alight — a contagious damage-over-time you can dash
  out of), `Ice` (mutually exclusive with Fire), `Bomb`, `Big`, `Multi` (splits
  into a fan on apex/wall), `Extra` (dual-wield + faster slash), `Caffeine`
  (speed + dash reset), `Shield` (blocks one lethal hit), `Warp` (teleport — and
  *squash* anyone you land on), `Stab` (lunge-slash gap-closer), `Last Laugh`
  (detonate on death), `Unstoppable` (un-parryable throws), `Hot Feet` (scorch a
  fiery trail), plus the `Bamboozle` anti-power (inverts your controls — never
  the first book of a match).
- **Status effects** — *Burning* spreads fighter-to-fighter and is stomped out
  by dashing; *Frozen* fighters are brittle glass (mash dash to break free, or
  shatter on any bump or boomerang).
- **Soft body collision** — fighters gently shove each other apart instead of
  overlapping, and crashing into a frozen foe smashes them to pieces.
- **Dynamic economy** — power-book spawn odds decay the more powers the leading
  fighter already holds, to curb snowballing.
- **Match-end awards** — post-match telemetry hands out comedic awards
  (Fastest Reflexes, Ice Breaker, Pyromaniac, Short Fuse, Drunken Master, …).

## Project structure

```
src/
├─ main.ts            # entry point — wires input + starts the loop
├─ constants.ts       # logical resolution & arena bounds
├─ types.ts           # shared cross-module types
├─ style.css          # page/canvas styling
│
├─ core/              # engine plumbing
│  ├─ canvas.ts       # shared canvas + 2D context
│  ├─ math.ts         # vector & number helpers
│  ├─ audio.ts        # procedural WebAudio synth
│  └─ input.ts        # keyboard / mouse / touch
│
├─ data/              # static, declarative game data
│  ├─ characters.ts   # the six food fighters + their vector art
│  ├─ powers.ts       # power-up definitions
│  └─ arena.ts        # obstacle & spawn layout
│
├─ gfx/
│  └─ shapes.ts       # reusable canvas shape helpers
│
├─ entities/          # simulation objects (one class per file)
│  ├─ Player.ts
│  ├─ Boomerang.ts
│  ├─ FirePatch.ts
│  ├─ Pickup.ts
│  └─ Particle.ts
│
├─ systems/           # cross-entity logic
│  ├─ collision.ts    # geometry + boomerang/parry resolution
│  ├─ ai.ts           # CPU fighter behaviour
│  └─ effects.ts      # particle-burst spawners
│
├─ game/              # orchestration
│  ├─ state.ts        # the single mutable game-state container
│  ├─ flow.ts         # match / round lifecycle + economy decay
│  ├─ awards.ts       # post-match telemetry awards
│  ├─ update.ts       # per-frame simulation step
│  ├─ render.ts       # per-frame draw dispatch
│  └─ loop.ts         # requestAnimationFrame loop
│
└─ ui/                # screens & overlays
   ├─ arena.ts        # arena backdrop
   ├─ world.ts        # play-field (arena + entities)
   ├─ hud.ts          # scoreboard / banners
   └─ menu.ts         # title & match-over screens
```

### Architecture notes

- **`game/state.ts`** holds the one mutable `game` object. It imports its entity
  types with `import type` only, so it stays at the bottom of the dependency
  graph and lets entities/systems freely reference shared state without runtime
  import cycles.
- Rendering shares a single `ctx` exported from **`core/canvas.ts`**, keeping the
  drawing code close to the original single-file version.
- Gameplay tuning lives in **`data/`** — adjust fighters, power-ups or the arena
  layout there without touching simulation code.

## Tech

- [Vite 6](https://vite.dev/) — dev server & bundler
- [TypeScript 5](https://www.typescriptlang.org/) — `strict` mode enabled

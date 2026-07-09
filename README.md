# 🥑 Boomerang Buffet

An original arena brawler homage to the boomerang party-fighter genre. Cute food
fighters fling returning boomerangs that bounce off walls and slice opponents.
Grab power-ups, dash, and parry — last snack standing wins the round.

Built with **Vite** + **TypeScript** + Canvas 2D. No game-art or audio assets:
every fighter is procedural vector art, every arena is painted by a
biome-themed renderer, every icon is hand-drawn vector geometry, and every
sound is a tiny WebAudio synth. The only binary assets are the two bundled
typefaces (Lilita One & Nunito, via `@fontsource`).

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (opens the browser)
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
npm run typecheck
npm test         # headless sim suite: AI balance guardrails + arena integrity
npm run sim      # print the AI tuning KPI table (round pacing, lethality,
                 # aggro spread, idle vs dodging survival per difficulty)
```

The test suite runs the **real game loop headlessly** (jsdom + a stubbed
canvas), fast-forwarding whole bot matches in milliseconds — so AI difficulty
is tuned against measured numbers (see `tests/sim.ts`), and every arena's
layout is validated programmatically (spawn clearances, switch/gate wiring,
and a bots-can-actually-finish-a-match liveness check).

## Controls

Up to 4 fighters can be controlled locally at once (set **Local Players** on
the match-setup screen) — P1 uses mouse + arrows, P2/P3 are keyboard-only
(they simply face the way they last moved), and P4 is a connected gamepad.

**P1 — mouse + keyboard**

| Action | Input |
| ------ | ----- |
| Move   | `WASD` / Arrow keys (Arrow keys only once a 2nd local player joins) |
| Aim    | Mouse (custom crosshair; charging shows the predicted flight path) |
| Throw  | Left-Click — **hold to charge & bank the curve** |
| Slash  | Right-Click / `E` — melee kill **and** clash/parry incoming boomerangs |
| Dash / Warp | `Space` (with **Warp** power, dash teleports you to your airborne boomerang) |
| Hop    | `Shift` / `F` — a vertical dodge over boomerangs, foes and pits |
| Pause  | `Esc` |
| Mute   | `M` |

**P2 — keyboard (WASD)**

| Action | Input |
| ------ | ----- |
| Move   | `W` `A` `S` `D` |
| Throw  | `V` (hold to charge) |
| Slash  | `X` |
| Dash   | `C` |
| Hop    | `Z` |

**P3 — keyboard (IJKL)**

| Action | Input |
| ------ | ----- |
| Move   | `I` `J` `K` `L` |
| Throw  | `,` (comma, hold to charge) |
| Slash  | `O` |
| Dash   | `U` |
| Hop    | `N` |

**P4 — gamepad** (any standard-mapping controller, e.g. a PS5 DualSense)

| Action | Input |
| ------ | ----- |
| Move   | Left stick |
| Aim    | Right stick (falls back to facing the move direction if left centered) |
| Throw  | Cross/A or right trigger (hold to charge) |
| Slash  | Circle/B |
| Dash   | Square/X or right bumper |
| Hop    | Triangle/Y |

## Core mechanics (modelled on *Boomerang Fu*)

- **Armed / Unarmed state machine** — slashing requires holding a boomerang. The
  instant you throw, you're *unarmed* and can only dash to survive until it
  returns. Slashing is also faster than throwing, so it wins point-blank trades.
- **Clash / parry** — a well-timed slash deflects an incoming boomerang straight
  back at its owner.
- **Charged curve throws** — tap to throw straight; hold to bank the flight path
  into an arc (max charge nearly orbits). The arc is *steerable*: strafe
  sideways as you release and the boomerang banks toward the side you're
  moving — the charging trajectory preview always shows the true path.
- **Soft aim assist** — keyboard-only and gamepad fighters get a subtle
  magnetism toward enemies within a narrow cone of their aim (mouse players
  aim raw), keeping every input device competitive.
- **Difficulty that means it** — bots have humanlike reaction times, aim
  error, telegraphed melee windups and dodge latency, all tuned per tier:
  *Chill* is genuinely beatable, *Spicy* earns its name — and never by
  cheating with frame-perfect reads.
- **Stackable power-ups** — modifiers accumulate and combine, persisting until
  death: `Fire` (sets foes alight — a contagious damage-over-time you can dash
  out of), `Ice` (mutually exclusive with Fire), `Bomb`, `Big`, `Multi` (splits
  into a fan on apex/wall), `Extra` (dual-wield + faster slash), `Caffeine`
  (speed + dash reset), `Shield` (blocks one lethal hit), `Warp` (teleport — and
  *squash* anyone you land on), `Stab` (lunge-slash gap-closer), `Last Laugh`
  (detonate on death), `Unstoppable` (un-parryable throws), `Hot Feet` (scorch a
  fiery trail), `Telekinesis` (remote-pilot your throw toward the cursor while
  you hold), plus the `Bamboozle` anti-power (inverts your controls — never the
  first book of a match).
- **Status effects** — *Burning* spreads fighter-to-fighter and is stomped out
  by dashing; *Frozen* fighters are brittle glass (mash dash to break free, or
  shatter on any bump or boomerang).
- **Soft body collision** — fighters gently shove each other apart instead of
  overlapping, and crashing into a frozen foe smashes them to pieces.
- **Game modes** — *Free-for-All*, *Team Up* (two squads, friendly-fire off),
  *Golden Boomerang* (hold the artifact a cumulative N seconds to win — your
  power-ups are suspended while you carry it), and *Hide & Seek*.
- **Arenas & hazards** — eight biome-themed arenas (or random each round):
  bottomless **pits** (dash or hop to leap them), linked **teleporters** that
  preserve momentum, **crusher pistons**, **floor switches** that retract
  colour-matched **gates**, leafy **bushes** for stealth, and the Freezer's
  **slick ice floors** that turn footwork into drifting.
- **Dynamic economy** — power-book spawn odds decay the more powers the leading
  fighter already holds, to curb snowballing.
- **Sudden death** — rounds that stall past 45 seconds get a "HURRY UP!"
  warning, then a wall of fire creeps in from the arena borders until someone
  settles it (Hide & Seek keeps its own clock).
- **Cinematic feel** — fighters are *sliced into two tumbling halves* on death
  (interiors showing), slow-motion on round-deciding kills, hitstop, screen
  shake, blast screen-flash, dash afterimages, ricochet sparks, kill-streak
  fanfare (DOUBLE KILL! / TRIPLE KILL! / RAMPAGE!), kill popups,
  squash-and-stretch fighters, scorch decals, a soft vignette and a charged
  throw trajectory preview with a max-charge ping.
- **Match-end awards** — post-match telemetry hands out comedic awards on a
  podium screen (Fastest Reflexes, Ice Breaker, Pyromaniac, Short Fuse,
  Drunken Master, Slow Learner, …).
- **A real front end** — animated title screen, match setup with fighter
  select & arena minimaps, a how-to-play page with a hoverable power glossary,
  an Esc pause menu, and settings persisted to `localStorage`.

## Project structure

```
src/
├─ main.ts            # entry point — fonts, input, starts the loop
├─ constants.ts       # logical resolution & arena bounds
├─ types.ts           # shared cross-module types
├─ style.css          # page shell styling
│
├─ core/              # engine plumbing
│  ├─ canvas.ts       # shared HiDPI canvas + 2D context + offscreen layers
│  ├─ math.ts         # vector & number helpers
│  ├─ audio.ts        # procedural WebAudio synth
│  └─ input.ts        # keyboard / mouse / touch
│
├─ data/              # static, declarative game data
│  ├─ characters.ts   # the twelve food fighters + their vector art
│  ├─ powers.ts       # power-up definitions (+ one-line descriptions)
│  └─ arena.ts        # the eight arena layouts (geometry, spawns, hazards)
│
├─ gfx/
│  ├─ shapes.ts       # reusable canvas shape helpers
│  └─ icons.ts        # vector glyphs for every power + the winner's crown
│
├─ entities/          # simulation objects (one class per file)
│  ├─ Player.ts
│  ├─ Boomerang.ts
│  ├─ Crusher.ts
│  ├─ FirePatch.ts / IcePatch.ts
│  ├─ Pickup.ts
│  └─ Particle.ts     # sparks, chunks, rings, popup text, confetti
│
├─ systems/           # cross-entity logic
│  ├─ collision.ts    # geometry + boomerang/parry resolution
│  ├─ ai.ts           # CPU fighter behaviour
│  └─ effects.ts      # particle/decal/popup spawners
│
├─ game/              # orchestration
│  ├─ state.ts        # the single mutable game-state container + persistence
│  ├─ flow.ts         # match / round lifecycle + economy decay
│  ├─ awards.ts       # post-match telemetry awards
│  ├─ update.ts       # per-frame simulation step (pause, slow-mo)
│  ├─ render.ts       # per-frame draw dispatch (overlays, crosshair)
│  └─ loop.ts         # requestAnimationFrame loop + global input routing
│
└─ ui/                # screens & overlays
   ├─ widgets.ts      # shared canvas UI kit: fonts, panels, buttons, keycaps
   ├─ arena.ts        # biome-themed arena renderer (cached static layer)
   ├─ world.ts        # play-field (arena + decals + entities + weather)
   ├─ hud.ts          # scoreboard, banner, toasts, cooldown chips
   └─ menu.ts         # title / setup / help / pause / match-over screens
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

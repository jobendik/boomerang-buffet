# 🥑 Boomerang Buffet

An original top-down arena party fighter. Cute food fighters fling returning
boomerangs that curve, bounce off walls and slice opponents — then bat each
other's throws back in ever-faster rallies, barge rivals into pits, and come
back as ghosts to meddle when it all goes wrong. One hit, one kill; last
snack standing wins the round.

Built with **Vite** + **TypeScript** + Canvas 2D. No game-art assets: every
fighter is procedural vector art on a shared, expressive face-and-limbs rig,
every arena is painted by a biome-themed renderer, and every icon is
hand-drawn vector geometry. Audio is a real sample-based mix — ~70 curated
royalty-free sounds plus three music beds (see `AUDIO_CREDITS.md`), bundled
as small MP3s and driven by a WebAudio engine with round-robin variations,
pitch jitter, retrigger gating, voice caps, stereo placement, a small synth
layer and music that follows the match. The other binary assets are the two
bundled typefaces (Lilita One & Nunito, via `@fontsource`).

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (opens the browser)
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
npm run typecheck
npm test         # headless suite: combat-rule scenarios, AI balance
                 # guardrails, arena integrity, a chaos/invariants fuzz
npm run sim      # print the AI tuning KPI table (round pacing, lethality,
                 # aggro spread, idle vs dodging survival, 1v1 melee-duel
                 # winrate, post-death spectate time — per difficulty, plus
                 # a per-arena bot-only pacing probe)
npm run lab      # print how often each system actually fires per round on
                 # every arena (shoves, ring-outs, parries, rallies, clashes,
                 # trick-shot callouts, kills by cause)
```

The test suite runs the **real game loop headlessly** (jsdom + a stubbed
canvas), fast-forwarding whole bot matches in milliseconds. Three kinds of
test live on it:

- `tests/mechanics.test.ts` stages fighters by hand and drives them with
  scripted inputs to pin the combat rules (a shove at a pit's edge is the
  shover's kill; a parry speeds the boomerang up; ties go to the defender…).
- `tests/ai-balance.test.ts` aggregates many bot rounds into guardrails, so
  AI difficulty is tuned against measured numbers (see `tests/sim.ts`).
- `tests/arena-data.test.ts` validates every arena's layout (spawn
  clearances, switch/gate wiring) and that bots can finish a match on it.

`npm run sim` and `npm run lab` are the design laboratory: reports, not
pass/fail. `NOTES.md` records what was measured with them and why the game
is tuned the way it is.

## Controls

Up to 4 fighters can be controlled locally at once, each on their own device
(mouse + arrows, WASD keys, IJKL keys, or any connected gamepad — in any
combination). **To add a player, press that device's throw button on the
match-setup screen** (Ⓐ on a gamepad, `V` for WASD, `,` for IJKL), or use the
Local Players stepper. Menus work from the couch: `Enter` / gamepad
Start confirms, `Esc` / Circle backs out, Start pauses.

**Mouse + keyboard**

| Action | Input |
| ------ | ----- |
| Move   | `WASD` / Arrow keys (Arrow keys only once someone else is on WASD) |
| Aim    | Mouse (custom crosshair; charging shows the predicted flight path, ricochets included) |
| Throw  | Left-Click — **hold to charge & curve the flight** |
| Slash  | Right-Click / `E` — melee kill **and** parry incoming boomerangs. Unarmed, it's a bare-handed **swat** (parry only). One press, one swing |
| Dash   | `Space` — dodge, leap pits, **shove** whoever you hit (with **Warp**, teleport to your airborne boomerang) |
| Hop    | `Shift` / `F` — a vertical dodge over boomerangs, foes and pits |
| Pause  | `Esc` |
| Mute   | `M` |

**Keyboard (WASD)** — move `W` `A` `S` `D` · throw `V` · slash `X` · dash `C` · hop `Z`

**Keyboard (IJKL)** — move `I` `J` `K` `L` · throw `,` · slash `O` · dash `U` · hop `N`

Keyboard-only fighters face the way they last moved and get a soft aim assist.

**Gamepad** (any standard-mapping controller, e.g. a PS5 DualSense)

| Action | Input |
| ------ | ----- |
| Move   | Left stick |
| Aim    | Right stick (falls back to the move direction if left centred) |
| Throw  | Cross/A or right trigger (hold to charge) |
| Slash  | Circle/B |
| Dash   | Square/X or right bumper |
| Hop    | Triangle/Y |
| Pause  | Start/Options |

**As a ghost** (after you die): move as usual; any action button lets out a gust.

## How it plays

### The core

- **Armed / unarmed** — slicing requires holding a boomerang. The instant you
  throw, you're *unarmed* until it returns. Slashing is faster than throwing,
  so it wins point-blank trades.
- **Curved, steerable throws** — tap to throw nearly straight; hold to bank
  the flight into an arc (max charge nearly orbits). Strafe as you release
  and the boomerang banks toward the side you're moving. The charging preview
  always shows the true path — *through its ricochets*, so bank shots off
  walls, blocks, pistons and bumpers can be lined up on purpose.
- **Parry → rally** — slash an incoming boomerang and you bat it away
  *wherever you're aiming* (with a little magnetism toward a foe near that
  line, so a panic swat still goes back to sender). Every parry in a row
  winds it up ~17% faster, and it glows hotter and rings higher as it goes.
  Unarmed fighters can still **swat** bare-handed (narrower arc, longer
  recovery), so thrower and parrier can trade one boomerang back and forth
  until somebody's timing cracks. Bombs can be batted too: hot potato.
  A swing that meets the throw on the very frame it would land still saves
  you — ties go to the defender.
- **Dash tackles** — a dash is also a shove. Barge a rival and they go
  sliding off balance: harmless on open floor, fatal next to a pit, a piston
  or the flames, and **the kill is yours** (DUNKED! / PANCAKED! / ROASTED!).
  The way out is a dash back against the slide, or a hop over the gap. The
  tackler's dash (and its i-frames) ends on contact, so charging a ready
  swordsman head-on is a gamble; two tacklers meeting just BONK. It's the
  unarmed fighter's one weapon, and it spoils a wind-up.
- **Clashes** — two blades swung at each other clash (nobody dies, both are
  hurled apart) instead of being decided by player order. Rival boomerangs
  that meet mid-air clang off each other and carom away on new lines; BIG
  ones bully straight through; fire meeting ice fizzles both; anything
  touching a bomb sets it off.
- **Blast waves** — explosions hurl survivors outward (credit to the bomber
  if that ends badly), swat passing boomerangs onto new headings and set
  nearby bushes alight.
- **The finishing beat** — when a round is decided it isn't over: it plays
  on for a beat in slow motion while the camera pushes in, and whatever is
  already in flight still counts. Survive your own victory lap or it's a
  **DOUBLE KO** and nobody scores.
- **Ghosts** — the fallen linger. Steer your ghost anywhere and, every few
  seconds, let out a gust that shoves the living a short way and puffs their
  boomerangs off line. It can't kill by itself… (optional; Free-for-All and
  Team Up).
- **Trick-shot callouts & kill feed** — every boomerang remembers how it got
  there. BANK SHOT, DOUBLE BANK, PINBALL WIZARD, PORTAL SHOT, IMPOSSIBLE
  SHOT, RETURN TO SENDER, REDIRECTED, RALLY xN KILL, BACKSTAB, LONG SHOT,
  LUCKY BOUNCE, COMBO, PUNISHED, TELEFRAG, HAUNTED, FROM THE GRAVE… A feed
  down the right edge shows who got whom and how.

### Opponents with temperaments

Bots have humanlike reaction times, aim error, telegraphed melee windups and
dodge latency, all tuned per tier (*Chill* is genuinely beatable, *Spicy*
earns its name) — and never by cheating with frame-perfect reads. On top of
the tier, each snack plays to type (purely behavioural — no fighter is
faster or stronger):

| Temperament | Fighters | Plays like |
| ----------- | -------- | ---------- |
| **Brawler** | Toastie, Brock, Pepito | Fights close; walks in for the slice when you're unarmed |
| **Sniper** | Sunny, Citra, Nibbles | Hangs back; plans curved throws that actually arrive |
| **Trickster** | Sprinkle, Button, Scoops | Loves to parry your throw back and bank shots off walls |
| **Bully** | Avo, Berry, Pip | Hunts for the shove — especially near an edge |

A share of bot throws are *planned*: the bot flies candidate angles and
charges through the same flight maths your aiming preview draws and lets go
of the one that arrives (that's a throw bent round a pillar or banked off
the back wall). Bots also parry and swat, tackle when a shove would be
fatal, and — after a tier-scaled reaction time — dash or hop out of a shove
that's carrying them somewhere deadly. Easier tiers do all of it less.

Other long-standing behaviours remain: bots never release blind point-blank
throws, commit to a telegraphed duel when you get in their face, and get
bloodlust once the last human falls so nobody spectates for long.

### Power books

Stackable modifiers that combine and persist until death: `Fire` (sets foes
alight — a contagious damage-over-time you can dash out of), `Ice` (mutually
exclusive with Fire), `Bomb`, `Big`, `Multi` (splits into a fan on
apex/wall), `Extra` (dual-wield + faster slash), `Caffeine` (speed + dash
reset), `Shield` (a visible bubble that blocks one lethal hit — not the
void), `Warp` (teleport to your boomerang, *squashing* anyone you land on),
`Stab` (lunge-slash gap-closer), `Last Laugh` (detonate on death),
`Unstoppable` (un-parryable throws), `Hot Feet` / `Cool Walk` (elemental
trails), `Telekinesis` (remote-pilot your throw), `Disguise`, `Decoy`,
`Delayed Death`, `Phase Dash`, **`Heavyweight`** (can't be shoved, and
shoves harder), the `Battle Royale` event, plus the `Bamboozle` anti-power
(inverted controls — never the first book of a match).

Spawn odds decay the more powers the leading fighter holds, to curb
snowballing.

- **Status effects** — *Burning* spreads fighter-to-fighter and is stomped
  out by dashing; *Frozen* fighters are brittle glass (mash dash to break
  free, or shatter on any bump or boomerang).

### Arenas

Ten biome-themed arenas (or random each round), each with its own floor,
furniture and atmosphere:

- **Pits** (dash or hop to leap them — or get shoved in), linked
  **teleporters** that preserve momentum, **crusher pistons** (which now
  bank boomerangs too), **floor switches** that retract colour-matched
  **gates**, and the Freezer/Glacier's **slick ice floors**.
- **Bushes** are live scenery: the canopy really hides whoever is inside,
  rustles when they move or a throw rips through — and **burns**. Fire of
  any kind turns one into a bonfire that ignites its occupants, then a
  charred stump for the rest of the round.
- **Bumpers** fire boomerangs back out *faster* than they arrived (with
  flight time to spare) and ping fighters who hit them at speed.
- **Pinball** — a table full of bumpers with a side-lane drain.
- **Sumo** — an island in the void around one centre post. Out is out.

### Modes

*Free-for-All*, *Team Up* (two squads, friendly-fire off, team rings on the
floor), *Golden Boomerang* (hold the artifact a cumulative N seconds to win
— your powers are suspended while you carry it, and a tackle makes you
**fumble** it), and *Hide & Seek*.

Rounds that stall past 45 seconds get a "HURRY UP!" warning, then a wall of
fire creeps in. When a brawl boils down to its last two: **SHOWDOWN!**

### Presentation

- **Fighters that act**: a shared face rig (fear as a throw bears down,
  gritted focus on the wind-up, panic on fire, spiral eyes when bamboozled or
  shoved, a smug grin after a parry, a victory jig), feet with a walk cycle
  driven by ground covered, and mitten hands that hold, cock, throw, swing
  and swat. Drawn slightly larger than their hitbox.
- **Sliced in two** on death, with a cut-flash and a little haloed soul
  drifting off; hit-stop then slow-motion; a directional camera kick; the
  finishing push-in with cinema bars.
- **Light**: every boomerang is a small additive light source with a
  tapered ribbon trail; rally throws run gold → orange → white-hot.
- **Atmosphere** per biome: fireflies, lamp pools and dust, roaming neon
  wash, cloud shadows, snow. A 5% chance of rain on pit-free maps.
- **Audio**: stereo placement by screen position, a rising charge whine,
  parries that ring higher through a rally, music that sags in slow-mo and
  quickens for showdowns and sudden death.
- **Attract mode**: the title screen's backdrop is a live bot match.
- **Awards**: 28 comedic post-match awards (Trick Shot Artist, Hot Potato,
  Sumo Champion, Cliffhanger, Pacifist, Poltergeist, Teflon, Own Worst
  Enemy…), dealt so nobody leaves empty-handed.
- **Accessibility**: Pit Safety (Off / Gentle / Extreme), Effects (Full /
  Calm — tames shake, flashes and camera moves), Ghosts on/off, mute. All
  settings persist to `localStorage`.

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
│  ├─ audio.ts        # sample-based WebAudio engine (SFX buses + music beds)
│  └─ input.ts        # keyboard / mouse / touch
│
├─ data/              # static, declarative game data
│  ├─ characters.ts   # the twelve fighters, the shared face rig, bot temperaments
│  ├─ powers.ts       # power-up definitions (+ one-line descriptions)
│  └─ arena.ts        # the ten arena layouts (geometry, spawns, hazards)
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
│  └─ Particle.ts     # sparks, streaks, rings, popup text, halves, souls…
│
├─ systems/           # cross-entity logic
│  ├─ collision.ts    # geometry + shoves, parries, clashes, blast waves
│  ├─ ai.ts           # CPU fighter behaviour (+ shot planning, ghosts)
│  ├─ bushes.ts       # burnable, rustling cover
│  └─ effects.ts      # particle/decal/popup spawners
│
├─ game/              # orchestration
│  ├─ state.ts        # the single mutable game-state container, camera, kill feed,
│  │                  #   telemetry counters + persistence
│  ├─ flow.ts         # match / round lifecycle + economy decay
│  ├─ awards.ts       # post-match telemetry awards
│  ├─ update.ts       # per-frame simulation step (pause, slow-mo, attract mode)
│  ├─ render.ts       # per-frame draw dispatch (overlays, crosshair)
│  └─ loop.ts         # requestAnimationFrame loop + global input routing
│
└─ ui/                # screens & overlays
   ├─ widgets.ts      # shared canvas UI kit: fonts, panels, buttons, keycaps
   ├─ arena.ts        # biome-themed arena renderer (cached static layer)
   ├─ world.ts        # play-field (arena + decals + entities + weather)
   ├─ hud.ts          # scoreboard, banner, kill feed, toasts, cooldown chips
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
- Anything that moves a fighter against their will goes through
  **`Player.knock`**, which also records who did it; pits, crushers and
  flames consult that to credit the kill. Every death goes through
  **`Player.die(killer, dx, dy, opts)`**, where `opts` carries the cause, the
  trick-shot callout and style points.
- In dev builds `window.__bb` exposes the live `game` object and
  `startMatch()` for poking at states from the console.

## Tech

- [Vite 6](https://vite.dev/) — dev server & bundler
- [TypeScript 5](https://www.typescriptlang.org/) — `strict` mode enabled

# Boomerang Buffet — TODO / Roadmap

Working notes for continuing development toward the [`blueprint.md`](blueprint.md)
(a reverse-engineering of *Boomerang Fu*). This game is an **original homage**,
not a 1:1 port: it's **Vite + TypeScript + Canvas 2D**, single human player +
CPU bots, no external art/audio (everything is procedural vector art + WebAudio).

> A 1:1 clone is impossible/undesired (the original is Unity with FMOD, Rewired,
> NavMesh, 6-player local co-op, 36 maps). Treat the blueprint as a **design
> source**, port mechanics in the spirit of the source, and keep the codebase
> small and readable.

---

## How to run / verify

```bash
npm install
npm run dev        # dev server (canvas game in browser)
npm run typecheck  # tsc --noEmit (strict)
npm run build      # typecheck + vite build
```

**Always run `npm run build` after each chunk of work.** It's the gate; the game
can't be unit-tested headlessly (canvas/DOM), so build-clean + a manual dev-boot
is the bar.

---

## Architecture cheat-sheet (read before editing)

- **`src/game/state.ts`** — the single mutable `game` object. `game.state`
  (`menu|countdown|playing|roundover|matchover`), `game.mode` (0 FFA / 1 Team Up
  / 2 Golden), `game.golden`, `game.arenaSel`, timers, arrays of entities.
- **`src/game/update.ts`** — per-frame sim step + human input → `Intents`.
- **`src/game/flow.ts`** — match/round lifecycle, team assignment, pickup spawn,
  economy decay, `endRoundCheck` (mode-aware win conditions).
- **`src/data/arena.ts`** — `ARENAS[]` + **live bindings** `OBSTACLES`, `SPAWNS`,
  `PITS`, `PORTALS`, `arena`, reassigned by `setArena(i)`. Importers read these
  by name and transparently see the active arena. **Add new hazard arrays here.**
- **`src/data/powers.ts`** — `POWERS` map, `POWER_KEYS`, `ELEMENTAL_EXCLUSIVE`,
  `NEVER_FIRST`. New powers: add here, then handle in `Player.applyPower` and
  wherever the effect lives.
- **`src/data/characters.ts`** — 9 procedural fighters (`CHARS`). Add a `drawX`
  fn + a `CHARS` entry.
- **`src/entities/`** — `Player`, `Boomerang`, `FirePatch`, `Pickup`, `Particle`.
  Hazards live in `game.hazards` and must expose `update(dt): boolean` + `draw()`.
- **`src/systems/collision.ts`** — geometry + all damage resolution, plus
  `resolvePlayerCollisions`, `spreadFire`, `inPit`, `resolvePortals`.
- **`src/systems/ai.ts`** — bot behaviour (targeting, kiting, dodging, pit/hazard
  avoidance).
- **`src/ui/`** — `arena` (backdrop+hazards), `world` (play-field), `hud`,
  `menu` (title + selectors + match-over).

### Conventions you MUST follow
1. **Friendly fire goes through `Player.isEnemy(other)`.** Every new damage
   source (projectile, explosion, hazard, status) must gate kills with
   `attacker.isEnemy(victim)` so Team Up keeps working. Self-damage (e.g. own
   bomb) is `victim === owner || owner.isEnemy(victim)`.
2. **Telemetry → awards.** New stats go on `Player.stats` (init in constructor),
   are incremented at the kill/event site, and surface via a def in
   `src/game/awards.ts`.
3. **Arena-scoped data uses the live-binding pattern** in `arena.ts` (don't read
   it at module top-level; read inside functions so reassignment is visible).
4. **Powers** that persist live in `Player.powers: Set<PowerKey>`; timed
   afflictions (like `BAMBOOZLE`) live as a numeric timer field instead.
5. Keep comment density / naming consistent with surrounding code.

### Current feature inventory (already done)
Armed/unarmed state machine · clash/parry · charged curve throws · stackable
powers (Fire/Ice/Bomb/Big/Multi/Extra/Caffeine/Shield/Warp/Stab/Last Laugh/
Unstoppable/Hot Feet/Telekinesis/Bamboozle/**Disguise**) · contagious Burning ·
brittle Frozen (mash-to-break) · soft player collision · Warp squash-kill ·
3 arenas + random · bottomless pits + teleporters · **bushes (stealth cover)** ·
**crushers (squish-kill)** · **rain (douses fire)** ·
**Fall-Protection (Off/Gentle/Extreme)** · 9 fighters · modes: FFA / Team Up /
Golden Boomerang / **Hide & Seek** · economy decay · 13 match awards (incl.
**Rambo**, **Trash Compactor**).

---

## P1 — Deferred features (the originally-named next candidates)

### 1. Hide & Seek mode  ✅ DONE
`game.mode === 3`, with its own round flow in `endRoundCheck`.
- **Roles:** `Player.role` ('seeker' | 'hider' | 'none'). The human (player 0)
  is always the seeker; everyone else hides. (Bot-seeker degrades gracefully via
  the default hunt AI if the assignment is ever randomised.)
- **Setup phase (10s):** `game.hsSetup`; the seeker is rooted (intents zeroed in
  `update.ts`) and the screen is blacked out in `render.ts`.
- **Prop transformation:** hiders are stripped of weapons in `flow.ts` and reuse
  the **Disguise** still-to-prop logic (`Player.update`, gated on `isHider`).
- **Decoys:** `game.hsDecoys` scatters inert lookalike props so the seeker can't
  swat every prop — that's what makes the attempt pool meaningful.
- **Limited attacks:** `seeker.attemptsLeft`; each throw/slash spends one,
  *refunded* when it lands a kill (kills-delta in `update.ts`), so only whiffs
  bite. Runs dry → seeker can't attack.
- **Win:** clear all hiders → seeker scores; `hsTimer` (40s) elapses or seeker
  dies → hiders score. HUD banner shows timer / hiders-left / attempts.
- **AI:** bot hiders flee the seeker then hold still to disguise (`ai.ts`); bots
  are blind to disguised foes (the kept flaw). Still dodge thrown boomerangs.
- *Possible polish:* randomise the seeker so the human sometimes hides; taller
  models peek more from cover; make decoys block boomerangs.

### 2. Crushers & rain hazards  ✅ DONE
- **Crushers:** `CrusherDef` on the `Arena` type + data (live binding `CRUSHERS`);
  `Crusher` entity (eased sine cycle, solid via `resolveCrushers`, squish test in
  `update`). Pinned fighters die environmentally (`Player.crush`, no killer) →
  **"Trash Compactor"** award (`stats.crushDeaths`). Bots steer around them
  (`ai.ts`). Stepped each frame in `update.ts` after `resolvePlayerCollisions`.
- **Rain:** `game.raining` rolled in `startRound` (5%, pit-free maps only).
  Quickly decays `Player.burning`; slanting overlay drawn in `ui/world.ts`.

### 3. Bushes / stealth + "Rambo" award  ✅ DONE
- `bushes: Rect[]` added to `Arena` type + per-arena data (live binding `BUSHES`
  in `arena.ts`), drawn as leafy zones under fighters in `ui/arena.ts`.
- A fighter inside a bush renders at reduced opacity (`Player.inBush`) and is
  invisible to bot targeting (`ai.ts` skips `q.inBush`, alongside `q.disguised`).
- `stats.bushTime` accrues while inside → **"Rambo"** award in `awards.ts`.
- Still TODO (flavour): taller models peek more for the Hide & Seek tie-in.

### 4. Fall-protection accessibility (Off / Gentle / Extreme)  ✅ DONE
- `game.fallProtect` (0/1/2) + a menu selector ("FALL SAFETY").
- **Off:** current behaviour (walk/idle into a pit → fall).
- **Gentle:** `nudgeFromPits` repels a fighter approaching a pit lip.
- **Extreme:** `resolvePitSolids` treats pits as solid walls at runtime.
  (Both live in `collision.ts`; map boundary was already solid.)

---

## P2 — More powers & stacking interactions (medium, high payoff)

These slot into the existing power architecture cleanly (`powers.ts` +
`applyPower` + effect site). Remember `isEnemy` gating + telemetry.

- **Disguise** ✅ DONE — hold still ~0.5s to become a scenery prop
  (`drawProp` in `shapes.ts`: crate/bamboo/lantern); any move/attack/charge
  reverts. Bots can't see disguised players (`ai.ts`). Building block for
  Hide & Seek prop rendering.
- **Decoy** — on dash, spawn a short-lived clone mimicking appearance/boom count.
- **Cool Walk** — ice-trail counterpart to Hot Feet (slows foes, then freezes).
- **Delayed Death** — survive a lethal hit for ~2s before the death finalises
  (not vs pit/crush). Add a `dyingTimer`.
- **Dash-Through-Walls** — ignore the solid layer during the dash vector.
- **Weak Arm** — halve max throw distance (anti-power).
- **Battle Royale** — shrinking lethal border toward the collection point
  (needs a dynamic-bounds system; larger).
- **Stacking matrix** (blueprint "Complex Systemic Interactions"):
  - Ice + Explosive → blast **freezes** in a larger radius instead of killing.
  - Fire + Explosive → ring of persistent fire around the blast.
  - Multi + Explosive/Fire → already reduces split count (4 vs 5); verify radius
    scaling.
  - Burning + Frozen paradox → frozen block with burn timer still ticking under
    it; on burn-out it dies and the ice shatters.

---

## P3 — Bigger systems / content (large)

- **Local multiplayer / controllers** — multiple human players (the source's
  whole point). Currently only player 0 is human. Would need per-player input
  devices (gamepad API), split controls, and menu player-config. Big lift.
- **Golden mode polish** — time-dilation slow-mo when the carrier gets a kill
  (blueprint). Dynamic hold-time scaling exists; could refine.
- **Vertical dodge** — a jump/airborne state that lifts you out of the collision
  radius to leap projectiles/grounded foes (blueprint's Y-axis evasion). Touches
  collision + rendering (shadow offset).
- **More content** — toward 12 characters and biome-varied arenas; per-arena
  music/ambience synths.
- **More awards** — Vengeful Ghost (boomerang kills after owner death),
  Most Enthusiastic (distance travelled), Switcheroo (floor switches),
  Trash Compactor (with crushers).
- **Portals/teleporters** could gain the source's velocity-perfect feel + FX.

---

## Known limitations / cleanups
- Soft player-vs-player collision can nudge a fighter slightly into a wall for a
  frame (corrected next frame by obstacle resolve). Fine for a party game.
- Golden-carrier still shows power auras even though throws ignore them
  (cosmetic).
- `pickupSpawnChance` decay is global on the lead player's power count; could be
  per-player as in the source.
- Line-endings: repo mixes LF/CRLF on Windows (git warns, harmless).

---

## Suggested order for a fresh chat
All four P1 features (Hide & Seek, Crushers + rain, Bushes + Rambo,
Fall-Protection) and the Disguise power are ✅ done. Remaining, easiest first:

1. **More powers** (P2) — the scaffolding is all in place now:
   - **Cool Walk** — mirror of Hot Feet using a freezing `FirePatch`-style hazard.
   - **Weak Arm** — halve max throw distance (anti-power; tweak `doThrow`).
   - **Decoy** — clone on dash (mimic appearance/boom count).
   - **Delayed Death** — survive a lethal hit ~2s (`dyingTimer`).
   - **Dash-Through-Walls** — skip the solid layer during the dash vector.
2. **Elemental stacking matrix** (P2) — Ice+Bomb (freeze blast), Fire+Bomb
   (ring of fire), Burning/Frozen paradox. (Multi+elemental already 4-split.)
3. **More content** (P3) — toward 12 characters and biome-varied arenas;
   more awards (Vengeful Ghost, Most Enthusiastic, Switcheroo).
4. **Battle Royale** power + **vertical dodge/jump** (P3, larger systems).

Branch per feature, `npm run build` gate, keep `isEnemy`/telemetry conventions.

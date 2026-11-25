# Development notes — the "shoves, rallies & ghosts" overhaul

Short notes on what was changed, why, and what the numbers said. All
measurements come from the headless sim (`npm run sim`, `npm run lab`,
ad-hoc scripts on `tests/sim.ts`) unless marked *browser*. Nothing here was
human-playtested or tried on a physical controller; "feels" claims are design
judgement, not evidence.

## What the baseline looked like

Read from the code and measured before changing anything:

- A solid, tuned base: curve throws, slash/parry, dash/hop, 22 powers, 4
  modes, 8 arenas, sample audio, a sim harness with balance guardrails.
- Boomerangs never interacted with each other.
- A parry auto-returned the throw to its owner regardless of aim and the
  boomerang died a second later. An unarmed fighter had no answer but to
  dodge, so parries could never chain.
- Dashing through another fighter did nothing. Pits and crushers were
  self-inflicted deaths only.
- Two simultaneous slashes were resolved by player-array order.
- In bot play, melee was 1.2% of kills and parries happened 0.04 times a
  round: the game's close-range verbs barely existed in practice.
- **The round-deciding slow-mo never ran**: the round flipped to `roundover`
  on the same frame as the kill, and slow-mo only applies while `playing`.
- **Hit-stop was counted in slowed time**: 0.09 s of freeze ticking down at
  0.3× while the 0.28 s slow-mo timer burned in real time, so (by the code
  path) each kill was essentially one long freeze and the slow-mo it was
  meant to precede never showed.
- Bushes were painted under fighters (hiding was only an alpha fade), and
  bots' long throws ignored their own curve (by my arithmetic, ~90 px wide
  of the mark at 280 px range on a 0.6 charge).
- The statistical balance guardrails failed in 2 of 12 runs on the
  untouched code — and at the same rate after the changes (samples of 4–8
  from heavy-tailed distributions).

## The design bet

Not more content — make the three verbs (throw, slash, dash) talk to each
other and to the arena:

1. **Dash is a shove**, with kill credit for where the victim ends up.
2. **Parry is aimed and escalates** (and works bare-handed), so it chains.
3. **Things in flight collide**: boomerang/boomerang, blade/blade, blast
   wave/everything.
4. **A decided round still has to be survived** (the finishing beat).
5. Everything that happens gets **named** (callouts, feed, awards) so the
   table can argue about it.

## Before / after

Bot-only, Normal tier, all arenas (`npm run lab`; baseline numbers are the
first lab run, taken before the bots were taught the new moves):

| per round            | before | after |
| -------------------- | ------ | ----- |
| parries              | 0.04   | 0.60  |
| rallies (2+ parries) | 0      | 0.03  |
| tackles landed       | 0      | 0.20  |
| ring-out kills       | 0      | ~0.1 on pit arenas |
| mid-air clashes      | 0 (n/a)| 1.7   |
| kills with a callout | n/a    | ~35%  |
| double KOs           | 0 (impossible) | ~9% of rounds |

Human proxies vs bots (`tests/sim.ts`; medians; baseline at N=250–400,
"after" as the range seen across runs of N=60–500):

| metric                         | Chill b → a | Normal b → a | Spicy b → a |
| ------------------------------ | ----------- | ------------ | ----------- |
| idle survival (s)              | 8.3 → 7.6–8.7 | 7.5 → 5.5–5.7 | 7.0 → 4.0–4.3 |
| reactive-dodger survival (s)   | 26.8 → 24–27 | 20.2 → 13–18 | 14.0 → 12–14 |
| 1v1 melee rusher wins (N=400+) | 81% → 75%   | 66% → 61%    | 58% → 44%   |
| median round length (s)        | 10.1 → 11.9 | 9.2 → 11.1   | 10.8 → 12.9 |

Reading these honestly:

- Chill was deliberately restored to baseline leniency (see experiments).
- Normal and Spicy bots are deadlier against a target that only dodges —
  planned throws finally compensate for the curve. The proxies don't use
  any of the new defensive tools (parry, swat, dash-cancel), so this
  overstates it for a real player, by an unknown amount.
- The rusher's drop is mostly the finishing beat: a trade is now a DOUBLE KO
  rather than a win (~14% of duels), inflated by the proxy standing still
  after its kill.
- The dodger metric is very noisy even at N=250 (same config: 12.6 s and
  18.3 s on consecutive runs). Don't tune on it without far more samples.

Performance (*browser*, headless Chromium, script time per frame, 20 s):
baseline 0.47 ms mean / 1.2 ms p99 → now 0.79 ms / 2.1 ms; a six-fighter
round with Fire+Multi+Bomb+Hot Feet+Extra stacked on everyone: 1.55 ms mean,
5.3 ms p99, 11 ms worst. Raster time isn't captured by this probe.

## Experiments & what they taught

- **Which change made Chill deadlier?** Ablation at N=250 (planning off /
  tackles off / ghosts off / old spacing): only restoring the old 205–285 px
  spacing recovered baseline survival. Close-in temperaments, not planned
  throws, were the cause → temperament spacing now scales with the tier
  (`AITuning.temper`).
- **Callout inflation.** First pass: 40% of bot kills were "BANK SHOT!",
  because a throw clipping a wall beside the target counted. Now a ricochet
  counts only if the boomerang then flies ≥ 85 px, corner rattles count
  once, return-leg bounces don't count, and LUCKY BOUNCE requires the
  deflected throw to travel and hit somebody else. Bank shots: 0.53 → 0.29
  per round.
- **Bots that parry.** Their parry roll existed but was checked after the
  dash branch, so it only fired when dash was on cooldown. Given its own
  branch (plant, face it, swing on arrival) parries went 0.04 → 0.5 a round.
- **Unarmed swat.** Without it a rally can't pass 1 in a duel (the thrower
  is unarmed). With it, a scripted two-player rally runs 520 → 690 → 808 →
  945 → 1106 → 1150 px/s (cap) before anyone needs to miss.
- **Hold-to-slash** was a standing ~30%-uptime parry shield; swings are now
  per-press with a 0.13 s buffer.
- **Chaos fuzz** (5 random powers on every fighter, every round, all modes)
  found live particles could pass 2,500 → particle and hazard budgets.

## Rejected / not done

- **Explode-on-parry bombs** (the old rule) made slashing a bomb suicide.
  Replaced by batting it away — more counterplay, and the rally mechanic
  turns it into hot potato.
- **Weak Arm** was a stat malus with no decision in it; replaced by
  Heavyweight, which interacts with the shove system instead.
- **Laser-accurate planning for every bot throw**: would have made range
  combat a reaction test. Planning is a tier × temperament *share* of
  throws and still gets the tier's aim error.
- **Instant replay of the match point**: needs either state snapshots or a
  frame ring buffer (~60 MB); the finishing beat delivers most of the drama
  for none of the cost.
- **A renderer migration** (WebGL): Canvas 2D is nowhere near its budget
  here, and the look depends on vector strokes, not fill-rate.
- **Synth voice lines / ambient loops**: unverifiable without ears; the
  synth layer is limited to simple, quiet envelope-shaped tones.

## Known limits

- No human playtesting, no physical gamepad testing (the Gamepad code paths
  were exercised only through keyboard/mouse equivalents and unit logic).
- Audio was verified structurally in a real browser (74/74 decodes, voices
  and panners created, no errors) — not by ear. The synth layer's levels in
  particular are educated guesses.
- Ghost gusts and tackles are tuned by reasoning and bot sims; the right
  strengths for a couch of humans are unknown.
- Bots don't use bumpers on purpose, don't flee burning bushes, and haunt
  only by proximity.
- Hide & Seek and Golden Boomerang got the shared systems (and the Golden
  fumble) but no dedicated redesign.

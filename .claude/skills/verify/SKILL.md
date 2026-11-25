---
name: verify
description: Build, launch and drive Boomerang Buffet in a real browser to verify changes end-to-end.
---

# Verify Boomerang Buffet

Canvas game, no DOM UI — drive it with mouse clicks/keys at canvas coordinates.

## Build + serve

```bash
npm run build                                  # tsc + vite build → dist/
npx vite preview --port 4199 --strictPort &    # serve the production build
# or, for the dev-only window.__bb hook (see below):
npx vite --port 4199 --strictPort &
```

## Drive (Playwright + Chromium)

Use whatever Playwright/Chromium the machine has (a preinstalled `playwright`
module, or `playwright-core` installed in a scratch dir — NOT the repo — with
`executablePath` pointing at a local Chrome). Launch with args
`['--autoplay-policy=no-user-gesture-required', '--mute-audio']`.

- The game is one `<canvas id="game">` at logical 1024×640; convert logical
  coords via its boundingClientRect before clicking.
- Title PLAY button: logical (512, 404). Setup START MATCH: (682, 590).
  Setup BACK: (110, 598). Pause opens with Escape (QUIT TO MENU at
  (512, 373)); M toggles mute.
- Keyboard works too: Enter confirms title → setup → start and the podium's
  rematch; on the setup screen `V` / `,` add a WASD / IJKL player.
- First click also unlocks the AudioContext (audio only starts post-gesture).
- Bots play the match by themselves — waiting ~12 s after START yields
  throws, kills, round transitions without any input.
- The title screen runs a live (silent) bot match behind the logo.

## Staging states (dev server only)

`window.__bb = { game, tele, startMatch, startRound, ARENAS }`. Examples:

```js
// a bots-only match on a chosen arena
const g = __bb.game; g.arenaSel = 8; g.numPlayers = 4; __bb.startMatch();
for (const p of g.players) p.isAI = true;
// event counters since page load (shoves, parries, callouts, kills by cause)
JSON.stringify(__bb.tele)
```

The hook is stripped from production builds (`typeof window.__bb` →
`'undefined'` on the preview server).

## Observing audio (no ears in headless)

Use `page.addInitScript` to wrap `AudioContext.prototype.decodeAudioData`,
`AudioBufferSourceNode.prototype.start`, `OscillatorNode.prototype.start`
and `AudioContext.prototype.createStereoPanner` into counters on
`window.__probe`. Expectations: 74 decodes and 0 failures after the first
click; one loop start = music bed; one-shot `started` climbs steadily during
a bot match, as do panner creations (spatial placement) and — more slowly —
oscillator starts (the synth layer: tackles, callouts, yelps, charge whine);
`started` freezes while muted (M).

Watch `console` errors and `response.status() >= 400` for missing assets.

## Gotchas

- `npm test` / `npm run sim` / `npm run lab` run the real loop headlessly
  under jsdom — they must stay green with audio changes (audio is a no-op
  with no AudioContext), but they are CI, not verification.
- The sim is random: judge balance changes on `npm run sim` medians at
  SIM_SURVIVALS ≥ 60, not on a single test run.
- Shapeforms source folders in the external library contain en-dash
  characters — resolve them with `find ... -name "Prefix*"`, don't type
  the dash.

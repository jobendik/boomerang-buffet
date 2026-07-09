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
```

## Drive (playwright-core + system Chrome)

Install `playwright-core` in a scratch dir (NOT the repo) and launch with
`executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`,
args `['--autoplay-policy=no-user-gesture-required', '--mute-audio']`.

- The game is one `<canvas id="game">` at logical 1024×640; convert logical
  coords via its boundingClientRect before clicking.
- Title PLAY button: logical (512, 404). Setup START MATCH: (682, 597).
  Setup BACK: (110, 598). Pause opens with Escape; M toggles mute.
- First click also unlocks the AudioContext (audio only starts post-gesture).
- Bots play the match by themselves — waiting ~12 s after START yields
  throws, kills, round transitions without any input.

## Observing audio (no ears in headless)

Use `page.addInitScript` to wrap `window.AudioContext`,
`AudioContext.prototype.decodeAudioData` and
`AudioBufferSourceNode.prototype.start` into counters on `window.__probe`.
Expectations: 74 decodes and 0 failures after the first click; one loop
start = music bed; one-shot `started` climbs steadily during a bot match;
`started` freezes while muted (M).

Watch `console` errors and `response.status() >= 400` for missing assets.

## Gotchas

- `npm test` / `npm run sim` run the real loop headlessly under jsdom —
  they must stay green with audio changes (audio is a no-op with no
  AudioContext), but they are CI, not verification.
- Shapeforms source folders in the external library contain en-dash
  characters — resolve them with `find ... -name "Prefix*"`, don't type
  the dash.

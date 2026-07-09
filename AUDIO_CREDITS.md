# Audio credits

Every sound in `src/assets/audio/` was converted (trimmed, peak-normalized,
mono/stereo-staged, MP3 VBR) from the following royalty-free sources. File
names below are the in-game asset names.

The full conversion pipeline is `tools/build_audio.sh` (ffmpeg required); it
regenerates every asset from the source libraries listed in
`POSSIBLE_SFX/paths_sfx.txt` plus the project's own `POSSIBLE_SFX/` folder.

## FilmCow Recorded / Designed SFX — filmcow.com (royalty-free license)

- `throw_1..3`, `throwbig_2` — "swoosh 1–4"
- `dash_1..3` — "woosh 1 / 3 / 7"
- `slice_1..4` (chop layer) — "cleaver 1 / 3 / 5 / 7" (+ "stab 4" in slice_4)
- `catch_2` — "punch 3"
- `parry_1` — "metal clang 1"
- `shatter_1..2` — "glass and junk hit 1 / 2"
- `crack_1..2` — "glass clink 1 / 3"
- `charge_1` — "glass ding 1"
- `fall_1..2` — "slide whistle 1 / 2"
- `fight_1` (whoosh layer) — "swoosh 4"
- `sudden_1` — "deep sci fi stinger 1" (Designed pack)

## Shapeforms Audio — free sound effects packs (royalty-free license)

- `slash_1..3` — Hack & Slash: "Blade Swing Noise Slice 02", "Dagger Slash 01",
  "Whoosh Short Light 03"
- `parry_2` — Hack & Slash: "Blade Metal Impact Recoil 01"
- `catch_1` — Hit & Punch: "HIGH_SNAP_02"
- `throwbig_1` — Hit & Punch: "WHOOSH_ARM_SWING_01_WIDE"
- `slice_1/3` (squelch layer) — Hit & Punch: "PUNCH_SQUELCH_HEAVY_05 / 01"
- `slice_2` (splat layer) — Cyberpunk Arsenal: "GORESplt_Giblet Splatter_02"
- `fight_1` (hit layer) — Hit & Punch: "PUNCH_DESIGNED_HEAVY_23"
- `power_1` — Arcane Activations: "Glyph Activation Light 01"
- `freeze_1` — Arcane Activations: "Arcane Wind Chime Gust"
- `gate_1` — Arcane Activations: "Rotate Stone 03"
- `golden_1` — The Mint: "Coin Flung"
- `bomb_1` — Cyberpunk Arsenal: "EXPLDsgn_Explosion Impact_14"
- `warp_1` — Cyberpunk Arsenal: "EXPLDsgn_Implode_15"
- `streak_1` — Cyberpunk Arsenal: "DSGNStngr_Kill Confirm Metallic_02"
- `hurry_1` — Future UI: "Error Triplet-5"
- `bigkill_1` — Dystopia: "SUB_DROP_DEEP"
- `crush_1` — Balloon: "Water-Filled Bln Impact" + Hit & Punch squelch

## Kenney — kenney.nl (CC0)

- `bomb_2..3` — sci-fi sounds: "explosionCrunch_000 / 002"
- `shield_1` — "forceField_000"
- `ignite_1` — "thrusterFire_002"
- `portal_1` — "laserRetro_002"
- `pop_1` — "slime_000"
- `switch_1..2` — UI audio: "switch10 / switch11"

## JDSherbert — Ultimate UI SFX Pack (free license)

- `uiclick_1` — "Select 1", `uihover_1` — "Cursor 2", `uiback_1` — "Cancel 1"
- `pausein_1` / `pauseout_1` — "Popup Open / Close 1"
- `pip_1` — "Cursor 1"

## Bundled game-jam / asset-pack sounds (project `POSSIBLE_SFX/` library)

- `jump_1`, `land_1..2`, `step_1..6`, `heartbeat_1` — player foley set
- `bounce_1..4` — "Impact-Wood-1/2", "Impact-Rock-1", "Impact-Brick-1"
- `power_2` — "Potion-Pickup", `respawn_1` — "Respawn-Sound"
- `roundwin_1` — "Result-Impact", `matchwin_1` — "victory",
  `matchlose_1` — "defeat"
- `music_menu`, `music_game`, `music_podium` — menu / battle / podium beds
  (trimmed to 96-second loops)

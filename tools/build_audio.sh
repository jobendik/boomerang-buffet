#!/bin/bash
# Boomerang Buffet — audio asset build script.
# Converts curated source sounds into normalized, silence-trimmed, small MP3s.
set -u

FC="C:/Users/joben/Projects/INSPIRATION_FX/FilmCow Recorded SFX/FilmCow Recorded SFX"
FD="C:/Users/joben/Projects/INSPIRATION_FX/FilmCow Designed SFX/FilmCow Designed SFX"
SF="C:/Users/joben/Downloads/Shapeforms Audio Free Sound Effects/Shapeforms Audio Free Sound Effects"
KS="C:/Users/joben/Projects/INSPIRATION_FX/kenney_sci-fi-sounds/Audio"
KU="C:/Users/joben/Projects/INSPIRATION_FX/kenney_ui-audio (1)/Audio"
PS="C:/Users/joben/Projects/BoomerangBuffet/POSSIBLE_SFX"
OUT="$(cd "$(dirname "$0")/.." && pwd)/src/assets/audio"
DYST=$(find "$SF" -maxdepth 1 -type d -name "Dystopia*" | head -1)
MINT=$(find "$SF" -maxdepth 1 -type d -name "The Mint*" | head -1)
TMP="${TMPDIR:-/tmp}/boomerang_audio_tmp"
mkdir -p "$OUT" "$TMP"
FAIL=0

# --- helpers -----------------------------------------------------------------
# Stage 1: decode + trim/filter to an intermediate WAV (mono unless music).
# Stage 2: measure peak, apply gain to hit -1.3 dBFS, encode MP3 VBR.

peak_gain() { # print gain (dB) needed to bring file's peak to -1.3 dB
  local f="$1"
  local mv
  mv=$(ffmpeg -hide_banner -i "$f" -af volumedetect -f null - 2>&1 | grep max_volume | sed 's/.*max_volume: \(.*\) dB/\1/')
  [ -z "$mv" ] && mv=0
  echo "$mv" | awk '{ g = -1.3 - $1; if (g > 30) g = 30; printf "%.2f", g }'
}

encode() { # encode <tmpwav> <dest> <channels>
  local src="$1" dest="$2" ch="$3"
  local g
  g=$(peak_gain "$src")
  ffmpeg -hide_banner -loglevel error -y -i "$src" -af "volume=${g}dB" -ac "$ch" -ar 44100 -codec:a libmp3lame -q:a 5 "$dest" || { echo "ENCODE FAIL: $dest"; FAIL=1; }
}

sfx() { # sfx <source> <name> [extra-filter]
  local src="$1" name="$2" extra="${3:-}"
  local flt="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-58dB:start_silence=0.05,areverse"
  [ -n "$extra" ] && flt="$flt,$extra"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -af "$flt" -ac 1 -ar 44100 "$TMP/$name.wav" || { echo "PREP FAIL: $name ($src)"; FAIL=1; return; }
  encode "$TMP/$name.wav" "$OUT/$name.mp3" 1
}

sfx2() { # stereo sfx (UI / stingers where width is nice)
  local src="$1" name="$2" extra="${3:-}"
  local flt="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-58dB:start_silence=0.05,areverse"
  [ -n "$extra" ] && flt="$flt,$extra"
  ffmpeg -hide_banner -loglevel error -y -i "$src" -af "$flt" -ac 2 -ar 44100 "$TMP/$name.wav" || { echo "PREP FAIL: $name ($src)"; FAIL=1; return; }
  encode "$TMP/$name.wav" "$OUT/$name.mp3" 2
}

mix2() { # mix2 <srcA> <srcB> <volB> <delayB_ms> <name> [post-filter]
  local a="$1" b="$2" vb="$3" db="$4" name="$5" post="${6:-anull}"
  ffmpeg -hide_banner -loglevel error -y -i "$a" -i "$b" -filter_complex \
    "[0:a]aformat=sample_rates=44100,pan=mono|c0=.5*c0+.5*c1[a0];[1:a]aformat=sample_rates=44100,pan=mono|c0=.5*c0+.5*c1,volume=${vb},adelay=${db}[b0];[a0][b0]amix=inputs=2:duration=longest:normalize=0,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-58dB:start_silence=0.05,areverse,${post}" \
    -ac 1 -ar 44100 "$TMP/$name.wav" || { echo "MIX FAIL: $name"; FAIL=1; return; }
  encode "$TMP/$name.wav" "$OUT/$name.mp3" 1
}

music() { # music <source> <name> <start> <dur>
  local src="$1" name="$2" ss="$3" dur="$4"
  ffmpeg -hide_banner -loglevel error -y -ss "$ss" -t "$dur" -i "$src" -af "afade=t=in:d=0.03,afade=t=out:st=$(echo "$dur" | awk '{print $1-0.05}'):d=0.05" -ac 2 -ar 44100 "$TMP/$name.wav" || { echo "MUSIC PREP FAIL: $name"; FAIL=1; return; }
  encode "$TMP/$name.wav" "$OUT/$name.mp3" 2
}

# --- core loop ---------------------------------------------------------------
sfx "$FC/swoosh 1.wav" throw_1
sfx "$FC/swoosh 2.wav" throw_2
sfx "$FC/swoosh 3.wav" throw_3
sfx "$SF/Hit and Punch Preview/AUDIO/WHOOSH_ARM_SWING_01_WIDE.wav" throwbig_1
sfx "$FC/swoosh 4.wav" throwbig_2
sfx "$SF/Hit and Punch Preview/AUDIO/HIGH_SNAP_02.wav" catch_1
sfx "$FC/punch 3.wav" catch_2
sfx "$SF/Hack and Slash Melee Combat Preview/Blade Swing Noise Slice 02.wav" slash_1
sfx "$SF/Hack and Slash Melee Combat Preview/Dagger Slash 01.wav" slash_2
sfx "$SF/Hack and Slash Melee Combat Preview/Whoosh Short Light 03.wav" slash_3
sfx "$FC/woosh 1.wav" dash_1
sfx "$FC/woosh 3.wav" dash_2
sfx "$FC/woosh 7.wav" dash_3
sfx "$PS/player/Jump.mp3_523dd26f.mp3" jump_1
sfx "$PS/player/Land-1.mp3_58b9ba36.mp3" land_1
sfx "$PS/player/Land-2.mp3_de259dd1.mp3" land_2

# deaths: cleaver chop + wet squelch layers (the food-fighter signature)
mix2 "$FC/cleaver 1.wav" "$SF/Hit and Punch Preview/AUDIO/PUNCH_SQUELCH_HEAVY_05.wav" 0.5 15 slice_1
mix2 "$FC/cleaver 3.wav" "$SF/Sci Fi Weapons Cyberpunk Arsenal Preview/AUDIO/GORESplt_Giblet Splatter_02.wav" 0.45 20 slice_2 "atrim=0:0.9"
mix2 "$FC/cleaver 5.wav" "$SF/Hit and Punch Preview/AUDIO/PUNCH_SQUELCH_HEAVY_01.wav" 0.5 15 slice_3
mix2 "$FC/cleaver 7.wav" "$FC/stab 4.wav" 0.55 10 slice_4

sfx "$DYST/AUDIO/SUB_DROP_DEEP.wav" bigkill_1 "atrim=0:2.6,afade=t=out:st=2.1:d=0.5"
sfx "$FC/metal clang 1.wav" parry_1
sfx "$SF/Hack and Slash Melee Combat Preview/Blade Metal Impact Recoil 01.wav" parry_2 "atrim=0:1.1,afade=t=out:st=0.85:d=0.25"
sfx "$KS/forceField_000.ogg" shield_1
sfx "$SF/Arcane Activations Preview/AUDIO/Glyph Activation Light 01.wav" power_1 "atrim=0:1.7,afade=t=out:st=1.35:d=0.35"
sfx "$PS/level/Potion-Pickup.mp3_0d141815.mp3" power_2
sfx "$MINT/AUDIO/Coin Flung.wav" golden_1
sfx "$SF/Arcane Activations Preview/AUDIO/Arcane Wind Chime Gust.wav" freeze_1 "atrim=0:2.0,afade=t=out:st=1.5:d=0.5"
sfx "$FC/glass and junk hit 1.wav" shatter_1 "atrim=0:1.1,afade=t=out:st=0.85:d=0.25"
sfx "$FC/glass and junk hit 2.wav" shatter_2 "atrim=0:1.1,afade=t=out:st=0.85:d=0.25"
sfx "$FC/glass clink 1.wav" crack_1 "atrim=0:0.5,afade=t=out:st=0.35:d=0.15"
sfx "$FC/glass clink 3.wav" crack_2 "atrim=0:0.5,afade=t=out:st=0.35:d=0.15"
sfx "$SF/Sci Fi Weapons Cyberpunk Arsenal Preview/AUDIO/EXPLDsgn_Explosion Impact_14.wav" bomb_1
sfx "$KS/explosionCrunch_000.ogg" bomb_2
sfx "$KS/explosionCrunch_002.ogg" bomb_3
sfx "$KS/thrusterFire_002.ogg" ignite_1 "atrim=0:0.8,afade=t=out:st=0.5:d=0.3"
sfx "$FC/slide whistle 1.wav" fall_1
sfx "$FC/slide whistle 2.wav" fall_2
mix2 "$SF/Balloon Preview/RUBRImpt_Water-Filled Bln Impact-27_SFRMS_Bln.wav" "$SF/Hit and Punch Preview/AUDIO/PUNCH_SQUELCH_HEAVY_01.wav" 0.7 0 crush_1
sfx "$PS/impacts/Impact-Wood-1.mp3" bounce_1
sfx "$PS/impacts/Impact-Wood-2.mp3" bounce_2
sfx "$PS/impacts/Impact-Rock-1.mp3" bounce_3
sfx "$PS/impacts/Impact-Brick-1.mp3" bounce_4
sfx "$KS/laserRetro_002.ogg" portal_1
sfx "$SF/Sci Fi Weapons Cyberpunk Arsenal Preview/AUDIO/EXPLDsgn_Implode_15.wav" warp_1 "atrim=0:1.4,afade=t=out:st=1.05:d=0.35"
sfx "$KS/slime_000.ogg" pop_1
sfx "$KU/switch10.ogg" switch_1
sfx "$KU/switch11.ogg" switch_2
sfx "$SF/Arcane Activations Preview/AUDIO/Rotate Stone 03.wav" gate_1
sfx "$FC/glass ding 1.wav" charge_1 "atrim=0:0.9,afade=t=out:st=0.65:d=0.25"
sfx2 "$SF/Sci Fi Weapons Cyberpunk Arsenal Preview/AUDIO/DSGNStngr_Kill Confirm Metallic_02.wav" streak_1 "atrim=0:1.4,afade=t=out:st=1.0:d=0.4"
sfx2 "$SF/Future UI Preview/Audio/Error Triplet-5.wav" hurry_1
sfx2 "$FD/deep sci fi stinger 1.wav" sudden_1 "atrim=0:2.4,afade=t=out:st=1.9:d=0.5"
sfx "$PS/player/Heart-Beat.mp3_1e759b97.mp3" heartbeat_1
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Cursor - 1.mp3" pip_1

# FIGHT! = arm-swing whoosh into a heavy designed punch
mix2 "$FC/swoosh 4.wav" "$SF/Hit and Punch Preview/AUDIO/PUNCH_DESIGNED_HEAVY_23.wav" 1.0 120 fight_1

sfx2 "$PS/impacts/Result-Impact.mp3" roundwin_1 "atrim=0:3.2,afade=t=out:st=2.5:d=0.7"
sfx2 "$PS/level/victory.mp3" matchwin_1
sfx2 "$PS/level/defeat.mp3" matchlose_1 "atrim=0:6,afade=t=out:st=5:d=1"
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Select - 1.mp3" uiclick_1
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Cursor - 2.mp3" uihover_1
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Cancel - 1.mp3" uiback_1
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Popup Open - 1.mp3" pausein_1
sfx2 "$PS/ui/JDSherbert - Ultimate UI SFX Pack - Popup Close - 1.mp3" pauseout_1
sfx "$PS/level/Respawn-Sound.mp3_d53a31ce.mp3" respawn_1
sfx "$PS/player/Concrete-Run-1.mp3_c0954406.mp3" step_1
sfx "$PS/player/Concrete-Run-2.mp3_bcd23528.mp3" step_2
sfx "$PS/player/Concrete-Run-3.mp3_721706e6.mp3" step_3
sfx "$PS/player/Concrete-Run-4.mp3_4f98c76e.mp3" step_4
sfx "$PS/player/Concrete-Run-5.mp3_121ee958.mp3" step_5
sfx "$PS/player/Concrete-Run-6.mp3_a62fc298.mp3" step_6

# music beds (trimmed to 96 s loops)
music "$PS/music/main_menu.mp3" music_menu 0 96
music "$PS/music/game_music.mp3" music_game 0 96
music "$PS/music/pause_music.mp3" music_podium 0 96

echo "--- done (FAIL=$FAIL) ---"
ls -la "$OUT" | tail -n +2 | awk '{t+=$5} END {printf "files: %d  total: %.2f MB\n", NR, t/1048576}'
exit $FAIL

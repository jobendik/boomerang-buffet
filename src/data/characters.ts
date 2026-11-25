import { ctx } from '../core/canvas';
import { clamp, TAU } from '../core/math';
import { roundRectPath } from '../gfx/shapes';
import type { Char, Persona, PersonaKey, Vec2 } from '../types';

/** Original cute-food fighters, each a simple procedural vector drawing. */

/**
 * The shared face rig. Every fighter draws its features through `eyes()` and
 * `mouthSmile()`, so a single mood set just before `char.draw` re-poses any
 * of them: fear when a throw whistles in, gritted focus while winding up, a
 * smug grin after a kill, spiral eyes when bamboozled… Callers that don't
 * care (menus, portraits) simply get the neutral face.
 */
export type Mood = 'idle' | 'focus' | 'scared' | 'panic' | 'happy' | 'smug' | 'dizzy' | 'ko' | 'frozen' | 'effort' | 'sad';

const face = { mood: 'idle' as Mood, blink: 0, t: 0 };

/** Pose the face for the next `char.draw` call. `blink` 0..1 closes the lids
 *  (idle only); `t` is a free-running clock for the animated moods. */
export function setFace(mood: Mood, blink = 0, t = 0): void {
  face.mood = mood;
  face.blink = blink;
  face.t = t;
}

const INK = '#241a2b';

function eyes(r: number, look: Vec2): void {
  // look: aim vector for pupils; r: radius
  const m = face.mood;
  const ex = r * 0.34;
  const ey = -r * 0.06;
  let er = r * 0.26;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (m === 'ko' || m === 'effort' || m === 'happy') {
    // drawn-on eyes: X X · > < · ^ ^
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.6, r * 0.11);
    for (const s of [-1, 1]) {
      const x = s * ex;
      const q = er * 0.72;
      ctx.beginPath();
      if (m === 'ko') {
        ctx.moveTo(x - q, ey - q);
        ctx.lineTo(x + q, ey + q);
        ctx.moveTo(x + q, ey - q);
        ctx.lineTo(x - q, ey + q);
      } else if (m === 'effort') {
        ctx.moveTo(x - s * q, ey - q);
        ctx.lineTo(x + s * q * 0.7, ey);
        ctx.lineTo(x - s * q, ey + q);
      } else {
        ctx.arc(x, ey + q * 0.5, q, Math.PI * 1.12, Math.PI * 1.88);
      }
      ctx.stroke();
    }
    return;
  }

  let pr = er * 0.5; // pupil radius
  let lx = clamp(look[0], -1, 1) * r * 0.18;
  let ly = clamp(look[1], -1, 1) * r * 0.18;
  let squish = 1; // vertical scale of the eye (blinks, squints)
  if (m === 'scared' || m === 'panic') {
    er *= 1.2;
    pr = er * 0.26;
    if (m === 'panic') {
      lx += Math.sin(face.t * 47) * r * 0.05;
      ly += Math.cos(face.t * 41) * r * 0.05;
    }
  } else if (m === 'frozen') {
    pr = er * 0.22;
    lx = ly = 0;
  } else if (m === 'focus') {
    squish = 0.78;
    pr = er * 0.46;
  } else if (m === 'sad') {
    ly = r * 0.1;
  } else if (m === 'idle') {
    squish = 1 - face.blink * 0.92;
  }

  for (const s of [-1, 1]) {
    const x = s * ex;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (m === 'smug') ctx.arc(x, ey - er * 0.15, er, 0, Math.PI); // half-lidded: lower half only
    else ctx.ellipse(x, ey, er, Math.max(0.6, er * squish), 0, 0, TAU);
    ctx.fill();
    if (m === 'dizzy') {
      // a wobbling spiral where the pupil should be
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.1, r * 0.07);
      ctx.beginPath();
      const a0 = face.t * 9 * s;
      for (let i = 0; i <= 14; i++) {
        const k = i / 14;
        const a = a0 + k * TAU * 1.6;
        ctx.lineTo(x + Math.cos(a) * er * 0.8 * k, ey + Math.sin(a) * er * 0.8 * k);
      }
      ctx.stroke();
      continue;
    }
    if (squish < 0.25) continue; // mid-blink: no pupil to see
    ctx.fillStyle = INK;
    ctx.beginPath();
    if (m === 'smug') ctx.arc(x + lx * 0.6 + r * 0.04, ey + er * 0.25, pr * 0.9, 0, TAU);
    else ctx.arc(x + lx, ey + ly * squish, pr, 0, TAU);
    ctx.fill();
    // a catch-light makes the eye read as wet & alive at any size
    if (r > 9 && pr > er * 0.4) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.arc(x + lx - pr * 0.3, ey + ly * squish - pr * 0.35, pr * 0.3, 0, TAU);
      ctx.fill();
    }
  }

  // brows carry the attitude
  if (m === 'focus' || m === 'sad' || m === 'smug' || m === 'scared' || m === 'panic') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    for (const s of [-1, 1]) {
      const x = s * ex;
      const top = ey - er * (m === 'scared' || m === 'panic' ? 1.5 : 1.12);
      ctx.beginPath();
      if (m === 'focus') {
        // angry: slanting down toward the nose
        ctx.moveTo(x + s * er * 0.95, top - er * 0.28);
        ctx.lineTo(x - s * er * 0.65, top + er * 0.42);
      } else if (m === 'smug') {
        ctx.moveTo(x - er * 0.85, top + er * 0.5 - (s > 0 ? er * 0.35 : 0));
        ctx.lineTo(x + er * 0.85, top + er * 0.5 - (s > 0 ? er * 0.5 : 0));
      } else {
        // worried: slanting up toward the nose
        ctx.moveTo(x + s * er * 0.9, top + er * 0.3);
        ctx.lineTo(x - s * er * 0.6, top - er * 0.2);
      }
      ctx.stroke();
    }
  }
  // a bead of sweat when frightened
  if (m === 'scared' && r > 9) {
    ctx.fillStyle = 'rgba(160,220,255,.9)';
    const sx = r * 0.82;
    const sy = -r * 0.5 + ((face.t * 1.4) % 1) * r * 0.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 0.16);
    ctx.quadraticCurveTo(sx + r * 0.12, sy + r * 0.04, sx, sy + r * 0.08);
    ctx.quadraticCurveTo(sx - r * 0.12, sy + r * 0.04, sx, sy - r * 0.16);
    ctx.fill();
  }
}

function mouthSmile(r: number): void {
  const m = face.mood;
  const my = r * 0.34;
  ctx.strokeStyle = 'rgba(40,20,30,.78)';
  ctx.fillStyle = '#3a1826';
  ctx.lineWidth = Math.max(1.6, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (m) {
    case 'scared':
    case 'panic': {
      // a round "O" — bigger and wobbling when properly panicked
      const k = m === 'panic' ? 1.35 + Math.sin(face.t * 30) * 0.15 : 1;
      ctx.ellipse(0, my + r * 0.08, r * 0.15 * k, r * 0.19 * k, 0, 0, TAU);
      ctx.fill();
      return;
    }
    case 'happy': {
      // a wide-open laughing "D" with a little tongue
      ctx.arc(0, my - r * 0.04, r * 0.34, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.ellipse(0, my + r * 0.2, r * 0.16, r * 0.09, 0, 0, TAU);
      ctx.fill();
      return;
    }
    case 'focus':
    case 'effort': {
      // gritted teeth
      const w = r * 0.5;
      const h = r * 0.2;
      ctx.fillStyle = '#fff';
      roundRectPath(-w / 2, my - h / 2 + r * 0.04, w, h, h * 0.4);
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, r * 0.07);
      roundRectPath(-w / 2, my - h / 2 + r * 0.04, w, h, h * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, my - h / 2 + r * 0.04);
      ctx.lineTo(0, my + h / 2 + r * 0.04);
      ctx.stroke();
      return;
    }
    case 'smug':
      // a lopsided smirk
      ctx.moveTo(-r * 0.2, my + r * 0.08);
      ctx.quadraticCurveTo(r * 0.08, my + r * 0.2, r * 0.3, my - r * 0.04);
      break;
    case 'dizzy':
    case 'ko':
      // a wobbly squiggle
      ctx.moveTo(-r * 0.26, my + r * 0.08);
      ctx.quadraticCurveTo(-r * 0.13, my - r * 0.06, 0, my + r * 0.08);
      ctx.quadraticCurveTo(r * 0.13, my + r * 0.22, r * 0.26, my + r * 0.08);
      break;
    case 'frozen':
      ctx.moveTo(-r * 0.12, my + r * 0.1);
      ctx.lineTo(r * 0.12, my + r * 0.1);
      break;
    case 'sad':
      ctx.arc(0, my + r * 0.36, r * 0.24, 1.2 * Math.PI, 1.8 * Math.PI);
      break;
    default:
      ctx.arc(0, r * 0.34, r * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();
}

function drawAvo(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.04, r * 0.78, r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(0, r * 0.34, r * 0.34, 0, TAU);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

function drawToast(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  roundRectPath(-r, -r, r * 2, r * 2, r * 0.4);
  ctx.fill();
  ctx.fillStyle = c.body;
  roundRectPath(-r * 0.82, -r * 0.7, r * 1.64, r * 1.62, r * 0.34);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

function drawEgg(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const rr = r * (0.92 + 0.16 * Math.sin(a * 3 + 1));
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(0, r * 0.02, r * 0.5, 0, TAU);
  ctx.fill();
  eyes(r * 0.9, look);
  mouthSmile(r * 0.9);
}

function drawBerry(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, r * 1.05);
  ctx.bezierCurveTo(r * 1.05, r * 0.4, r * 0.95, -r * 0.7, 0, -r * 0.75);
  ctx.bezierCurveTo(-r * 0.95, -r * 0.7, -r * 1.05, r * 0.4, 0, r * 1.05);
  ctx.closePath();
  ctx.fill();
  // seeds — fixed layout (a per-frame shuffle would shimmer distractingly)
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.9;
    const rr = (0.2 + ((i * 37) % 5) * 0.11) * r;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.9 + r * 0.1, r * 0.06, r * 0.1, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.accent;
  for (const s of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.35, -r * 0.7, r * 0.22, r * 0.12, s * 0.5, 0, TAU);
    ctx.fill();
  }
  eyes(r, look);
  mouthSmile(r);
}

function drawBroc(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.accent;
  roundRectPath(-r * 0.34, r * 0.2, r * 0.68, r * 0.9, r * 0.2);
  ctx.fill();
  ctx.fillStyle = c.dark;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.5 - r * 0.1, r * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, -r * 0.12, r * 0.7, 0, TAU);
  ctx.fill();
  eyes(r * 0.95, look);
  mouthSmile(r * 0.95);
}

function drawOrange(c: Char, r: number, look: Vec2): void {
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.3, r * 0.16, -0.6, 0, TAU);
  ctx.fill();
  eyes(r, look);
  mouthSmile(r);
}

function drawDonut(c: Char, r: number, look: Vec2): void {
  // dough ring
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.fill();
  // pink glaze with a drippy lower edge
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * TAU;
    const rr = r * (0.86 + 0.1 * Math.max(0, Math.sin(a * 5)) * (Math.sin(a) > 0 ? 1 : 0.2));
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  // sprinkles
  const sprinkle = ['#ff5d6c', '#7ad06d', '#ffd23a', '#8affd6', '#fff'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.4;
    const rr = r * 0.6;
    ctx.save();
    ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.rotate(a * 1.7);
    ctx.fillStyle = sprinkle[i % sprinkle.length];
    roundRectPath(-r * 0.04, -r * 0.12, r * 0.08, r * 0.24, r * 0.04);
    ctx.fill();
    ctx.restore();
  }
  // hole
  ctx.fillStyle = '#2a1f36';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();
  eyes(r * 0.78, look);
}

function drawChili(c: Char, r: number, look: Vec2): void {
  // glossy curved pepper body
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(0, r * 1.08);
  ctx.bezierCurveTo(r * 0.92, r * 0.7, r * 0.86, -r * 0.5, r * 0.16, -r * 0.78);
  ctx.bezierCurveTo(-r * 0.5, -r * 0.95, -r * 0.95, r * 0.3, 0, r * 1.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.95);
  ctx.bezierCurveTo(r * 0.74, r * 0.62, r * 0.7, -r * 0.4, r * 0.12, -r * 0.62);
  ctx.bezierCurveTo(-r * 0.42, -r * 0.78, -r * 0.78, r * 0.3, 0, r * 0.95);
  ctx.closePath();
  ctx.fill();
  // shine
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, r * 0.5);
  ctx.quadraticCurveTo(-r * 0.4, -r * 0.1, -r * 0.05, -r * 0.4);
  ctx.stroke();
  // green stem
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(r * 0.14, -r * 0.66);
  ctx.quadraticCurveTo(r * 0.4, -r * 0.95, r * 0.05, -r * 1.05);
  ctx.stroke();
  eyes(r * 0.78, look);
  mouthSmile(r * 0.7);
}

function drawShroom(c: Char, r: number, look: Vec2): void {
  // cream stem
  ctx.fillStyle = c.accent;
  roundRectPath(-r * 0.42, r * 0.05, r * 0.84, r * 0.95, r * 0.3);
  ctx.fill();
  // red cap
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r, r * 0.72, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 0.92, r * 0.64, 0, Math.PI, TAU);
  ctx.fill();
  // white spots
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const s of [[-0.5, -0.25, 0.18], [0.45, -0.2, 0.2], [0.0, -0.42, 0.15], [-0.12, -0.05, 0.12]] as const) {
    ctx.beginPath();
    ctx.ellipse(s[0] * r, s[1] * r, s[2] * r, s[2] * r * 0.8, 0, 0, TAU);
    ctx.fill();
  }
  eyes(r * 0.82, [look[0], Math.max(0, look[1])]);
  mouthSmile(r * 0.7);
}

function drawMelon(c: Char, r: number, look: Vec2): void {
  // watermelon wedge: a half-disc with the flat (cut) edge up
  ctx.fillStyle = c.dark; // rind
  ctx.beginPath();
  ctx.arc(0, -r * 0.18, r * 1.05, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.accent; // pale inner rind
  ctx.beginPath();
  ctx.arc(0, -r * 0.18, r * 0.9, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.body; // red flesh
  ctx.beginPath();
  ctx.arc(0, -r * 0.18, r * 0.74, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1622'; // seeds
  for (const s of [[-0.34, 0.28], [0.0, 0.42], [0.34, 0.28], [-0.16, 0.12], [0.18, 0.12]] as const) {
    ctx.beginPath();
    ctx.ellipse(s[0] * r, (s[1] - 0.18) * r, r * 0.06, r * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  eyes(r * 0.82, [look[0], Math.max(-0.3, look[1])]);
  mouthSmile(r * 0.62);
}

function drawCarrot(c: Char, r: number, look: Vec2): void {
  // leafy fronds sprouting from the crown
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = r * 0.13;
  ctx.lineCap = 'round';
  for (const s of [-1, 0, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.16, -r * 0.45);
    ctx.quadraticCurveTo(s * r * 0.5, -r * 1.0, s * r * 0.34, -r * 1.18);
    ctx.stroke();
  }
  // tapered root: a downward triangle
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.5);
  ctx.lineTo(r * 0.6, -r * 0.5);
  ctx.lineTo(0, r * 1.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(-r * 0.46, -r * 0.4);
  ctx.lineTo(r * 0.46, -r * 0.4);
  ctx.lineTo(0, r * 0.92);
  ctx.closePath();
  ctx.fill();
  // horizontal ridge ticks down the body
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = Math.max(1.4, r * 0.06);
  for (const yy of [-0.1, 0.2, 0.5] as const) {
    const half = (1 - (yy + 0.4) / 1.32) * r * 0.42;
    ctx.beginPath();
    ctx.moveTo(-half, yy * r);
    ctx.lineTo(half, yy * r);
    ctx.stroke();
  }
  eyes(r * 0.66, look);
  mouthSmile(r * 0.52);
}

function drawCone(c: Char, r: number, look: Vec2): void {
  // waffle cone (point down)
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, 0);
  ctx.lineTo(r * 0.5, 0);
  ctx.lineTo(0, r * 1.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,30,.4)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.18, 0);
    ctx.lineTo(i * r * 0.02, r * 1.1);
    ctx.stroke();
  }
  for (let i = 0; i <= 3; i++) {
    const yy = i / 3;
    const half = (1 - yy) * r * 0.5;
    ctx.beginPath();
    ctx.moveTo(-half, yy * r * 1.05);
    ctx.lineTo(half, yy * r * 1.05);
    ctx.stroke();
  }
  // scoop
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(0, -r * 0.34, r * 0.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(0, -r * 0.4, r * 0.66, 0, TAU);
  ctx.fill();
  // cherry on top
  ctx.fillStyle = '#e0454f';
  ctx.beginPath();
  ctx.arc(0, -r * 1.02, r * 0.16, 0, TAU);
  ctx.fill();
  // face sits on the scoop
  ctx.save();
  ctx.translate(0, -r * 0.4);
  eyes(r * 0.6, look);
  mouthSmile(r * 0.5);
  ctx.restore();
}

/**
 * Bot temperaments. Purely behavioural — no fighter is faster or stronger —
 * but each snack plays to type when the CPU drives it, so opponents become
 * people you learn: the chili always charges, the carrot hangs back and
 * curves one round the pillar, the donut wants to play tennis with your throw.
 */
export const PERSONAS: Record<PersonaKey, Persona> = {
  brawler: { title: 'Brawler', range: [135, 185], parry: 1.0, shove: 1.3, craft: 0.5, rush: 1, nerve: 0.85 },
  sniper: { title: 'Sharpshooter', range: [265, 330], parry: 0.6, shove: 0.4, craft: 1.6, rush: 0, nerve: 1.1 },
  trickster: { title: 'Trickster', range: [200, 260], parry: 2.0, shove: 0.8, craft: 1.25, rush: 0.2, nerve: 1.0 },
  bully: { title: 'Bully', range: [165, 225], parry: 0.8, shove: 2.4, craft: 0.7, rush: 0.5, nerve: 0.9 },
};

export const CHARS: Char[] = [
  { name: 'Avo', persona: 'bully', body: '#7fc242', dark: '#5a9430', accent: '#7a4a2a', draw: drawAvo },
  { name: 'Toastie', persona: 'brawler', body: '#f2c177', dark: '#c98f43', accent: '#8a5a2a', draw: drawToast },
  { name: 'Sunny', persona: 'sniper', body: '#fbfaf2', dark: '#d9d6c2', accent: '#ffcf3f', draw: drawEgg },
  { name: 'Berry', persona: 'bully', body: '#ff5d6c', dark: '#d83b4c', accent: '#7ad06d', draw: drawBerry },
  { name: 'Brock', persona: 'brawler', body: '#5fae57', dark: '#3f8a3a', accent: '#caa66a', draw: drawBroc },
  { name: 'Citra', persona: 'sniper', body: '#ff9f33', dark: '#e07d12', accent: '#ffd98a', draw: drawOrange },
  { name: 'Sprinkle', persona: 'trickster', body: '#c98f5a', dark: '#a06c3e', accent: '#ff9ecb', draw: drawDonut },
  { name: 'Pepito', persona: 'brawler', body: '#ff4d3a', dark: '#c9301f', accent: '#5fae57', draw: drawChili },
  { name: 'Button', persona: 'trickster', body: '#ff5d5d', dark: '#d83b3b', accent: '#f7efd8', draw: drawShroom },
  { name: 'Pip', persona: 'bully', body: '#f64b63', dark: '#3f8f3f', accent: '#c7e7a6', draw: drawMelon },
  { name: 'Nibbles', persona: 'sniper', body: '#ff8a33', dark: '#e26a16', accent: '#5fae57', draw: drawCarrot },
  { name: 'Scoops', persona: 'trickster', body: '#ffc2dd', dark: '#f79ec4', accent: '#dcb27a', draw: drawCone },
];

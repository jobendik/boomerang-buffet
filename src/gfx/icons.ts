import { ctx } from '../core/canvas';
import { TAU } from '../core/math';
import type { PowerKey } from '../data/powers';

/**
 * Hand-drawn vector glyphs for every power-up, replacing the old emoji icons
 * (which rendered differently on every OS and couldn't be tinted). Each icon
 * is drawn centred at (x, y) inside a `±s` box in the given colour, on a
 * consistent rounded-stroke style so pickups, HUD stacks, toasts and the menu
 * glossary all share one visual language.
 */

function flame(s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.75, -s * 0.35, s * 0.7, s * 0.25, 0, s);
  ctx.bezierCurveTo(-s * 0.7, s * 0.25, -s * 0.75, -s * 0.35, 0, -s);
  ctx.closePath();
}

export function drawPowerIcon(key: PowerKey, x: number, y: number, s: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const lw = Math.max(1.4, s * 0.24);
  ctx.lineWidth = lw;

  switch (key) {
    case 'FIRE': {
      flame(s);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.bezierCurveTo(s * 0.32, s * 0.18, s * 0.3, s * 0.42, 0, s * 0.74);
      ctx.bezierCurveTo(-s * 0.3, s * 0.42, -s * 0.32, s * 0.18, 0, -s * 0.1);
      ctx.fill();
      break;
    }
    case 'ICE':
    case 'COOLWALK': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(-Math.cos(a) * s, -Math.sin(a) * s);
        ctx.stroke();
        // little Y-tips on each arm
        for (const e of [1, -1]) {
          const tx = Math.cos(a) * s * 0.62 * e;
          const ty = Math.sin(a) * s * 0.62 * e;
          for (const w of [0.5, -0.5]) {
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(a + w) * s * 0.3 * e, ty + Math.sin(a + w) * s * 0.3 * e);
            ctx.stroke();
          }
        }
      }
      if (key === 'COOLWALK') {
        // motion dashes — the walking trail variant
        ctx.lineWidth = lw * 0.8;
        ctx.beginPath();
        ctx.moveTo(-s * 1.2, s * 0.9);
        ctx.lineTo(-s * 0.5, s * 0.9);
        ctx.stroke();
      }
      break;
    }
    case 'BOMB': {
      ctx.beginPath();
      ctx.arc(-s * 0.12, s * 0.22, s * 0.72, 0, TAU);
      ctx.fill();
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.3);
      ctx.quadraticCurveTo(s * 0.62, -s * 0.7, s * 0.5, -s * 0.95);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s * 0.52, -s * 0.95, s * 0.18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.arc(-s * 0.34, 0, s * 0.18, 0, TAU);
      ctx.fill();
      break;
    }
    case 'BIG': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, TAU);
      ctx.stroke();
      // four outward expansion arrows
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        const c = Math.cos(a);
        const n = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(c * s * 0.6, n * s * 0.6);
        ctx.lineTo(c * s, n * s);
        ctx.stroke();
      }
      break;
    }
    case 'MULTI': {
      for (const a of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, s * 0.7);
        ctx.lineTo(-s * 0.7 + Math.cos(a - 0.78) * s * 1.7, s * 0.7 + Math.sin(a - 0.78) * s * 1.7);
        ctx.stroke();
      }
      break;
    }
    case 'EXTRA': {
      // two stacked boomerang chevrons
      for (const o of [-0.38, 0.38]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, -s * 0.32 + o * s);
        ctx.lineTo(0, s * 0.38 + o * s);
        ctx.lineTo(s * 0.8, -s * 0.32 + o * s);
        ctx.stroke();
      }
      break;
    }
    case 'SPEED': {
      ctx.beginPath();
      ctx.moveTo(s * 0.45, -s);
      ctx.lineTo(-s * 0.4, s * 0.15);
      ctx.lineTo(s * 0.02, s * 0.15);
      ctx.lineTo(-s * 0.45, s);
      ctx.lineTo(s * 0.5, -s * 0.12);
      ctx.lineTo(s * 0.06, -s * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'SHIELD': {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.9, -s * 0.75, s * 0.78, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.68, s * 0.62, 0, s);
      ctx.quadraticCurveTo(-s * 0.68, s * 0.62, -s * 0.78, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.9, -s * 0.75, 0, -s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(0, s * 0.45);
      ctx.stroke();
      break;
    }
    case 'TELEPORT': {
      // swirl spiral
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        const a = t * TAU * 1.6;
        const r = s * (0.15 + t * 0.85);
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case 'STAB': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, s * 0.85);
      ctx.lineTo(s * 0.55, -s * 0.55);
      ctx.stroke();
      // crossguard + pommel
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, -s * 0.65);
      ctx.lineTo(-s * 0.65, -s * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.55, -s * 0.55);
      ctx.lineTo(s * 0.95, -s * 0.95);
      ctx.stroke();
      break;
    }
    case 'GHOST': {
      // little spook: dome head, wavy hem
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.7, Math.PI, 0);
      ctx.lineTo(s * 0.7, s * 0.55);
      for (let i = 0; i < 3; i++) {
        ctx.quadraticCurveTo(s * (0.47 - i * 0.47), s * (i % 2 ? 0.55 : 0.95), s * (0.23 - i * 0.47), s * 0.75);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#241a2b';
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(e * s * 0.26, -s * 0.18, s * 0.14, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'UNSTOPPABLE': {
      ctx.beginPath();
      ctx.arc(s * 0.25, 0, s * 0.62, 0, TAU);
      ctx.fill();
      for (const yy of [-0.45, 0, 0.45]) {
        ctx.lineWidth = lw * 0.75;
        ctx.beginPath();
        ctx.moveTo(-s * 1.0, yy * s);
        ctx.lineTo(-s * (0.5 - Math.abs(yy) * 0.2), yy * s);
        ctx.stroke();
      }
      break;
    }
    case 'HOTFEET': {
      flame(s * 0.7);
      ctx.fill();
      ctx.lineWidth = lw * 0.8;
      for (const yy of [0.55, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, s * yy);
        ctx.lineTo(-s * 0.35, s * yy);
        ctx.stroke();
      }
      break;
    }
    case 'TELEKINESIS': {
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.6, 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.28, 0, TAU);
      ctx.fill();
      break;
    }
    case 'BAMBOOZLE': {
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.arc(0, -s * 0.32, s * 0.45, Math.PI * 0.85, Math.PI * 2.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.12 * s, 0.05 * s);
      ctx.lineTo(0.02 * s, s * 0.36);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s * 0.85, s * 0.14, 0, TAU);
      ctx.fill();
      break;
    }
    case 'DISGUISE': {
      // domino mask
      ctx.beginPath();
      ctx.ellipse(-s * 0.45, 0, s * 0.5, s * 0.42, -0.15, 0, TAU);
      ctx.ellipse(s * 0.45, 0, s * 0.5, s * 0.42, 0.15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#241a2b';
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(e * s * 0.45, 0, s * 0.2, s * 0.15, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'WEAKARM': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9, -s * 0.3);
      ctx.quadraticCurveTo(0, -s * 0.95, s * 0.55, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.75, s * 0.25, s * 0.55, s * 0.7);
      ctx.stroke();
      // drooping arrowhead
      ctx.beginPath();
      ctx.moveTo(s * 0.25, s * 0.45);
      ctx.lineTo(s * 0.55, s * 0.7);
      ctx.lineTo(s * 0.85, s * 0.4);
      ctx.stroke();
      break;
    }
    case 'DECOY': {
      ctx.setLineDash([s * 0.28, s * 0.22]);
      ctx.beginPath();
      ctx.arc(-s * 0.35, -s * 0.25, s * 0.55, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(s * 0.35, s * 0.3, s * 0.55, 0, TAU);
      ctx.fill();
      break;
    }
    case 'DELAYED': {
      // hourglass
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.85);
      ctx.lineTo(s * 0.6, -s * 0.85);
      ctx.lineTo(-s * 0.6, s * 0.85);
      ctx.lineTo(s * 0.6, s * 0.85);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.32, s * 0.6);
      ctx.lineTo(-s * 0.32, s * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'PHASE': {
      // figure dashing through a wall
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s);
      ctx.lineTo(s * 0.1, s);
      ctx.stroke();
      ctx.lineWidth = lw * 0.85;
      for (const yy of [-0.4, 0, 0.4]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, yy * s);
        ctx.lineTo(s * 0.7, yy * s);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(s * 0.45, -s * 0.32);
      ctx.lineTo(s * 0.85, 0);
      ctx.lineTo(s * 0.45, s * 0.32);
      ctx.stroke();
      break;
    }
    case 'BATTLE': {
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.55, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.16, 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A little gold winner's crown, centred above (x, y), width ~2·s. */
export function drawCrown(x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd23a';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.5);
  ctx.lineTo(-s, -s * 0.35);
  ctx.lineTo(-s * 0.45, s * 0.05);
  ctx.lineTo(0, -s * 0.7);
  ctx.lineTo(s * 0.45, s * 0.05);
  ctx.lineTo(s, -s * 0.35);
  ctx.lineTo(s, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff5d6c';
  for (const e of [-0.6, 0, 0.6]) {
    ctx.beginPath();
    ctx.arc(e * s, s * 0.22, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

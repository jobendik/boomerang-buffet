import { ctx } from '../core/canvas';

/** Low-level reusable canvas shape helpers. */

/** Build a rounded-rectangle path on the shared context (does not fill/stroke). */
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw one of the static "scenery" props a disguised fighter blends into.
 * Drawn centred at the canvas origin (caller translates), sized to radius `r`.
 * `idx` selects: 0 crate · 1 bamboo cluster · 2 stone lantern.
 */
export function drawProp(idx: number, r: number): void {
  // shared ground shadow so the prop reads as a placed object, not a ghost
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.95, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  if (idx === 0) {
    // wooden crate
    ctx.fillStyle = '#9a6c3c';
    roundRectPath(-r * 0.95, -r * 0.95, r * 1.9, r * 1.9, r * 0.18);
    ctx.fill();
    ctx.fillStyle = '#7a5430';
    roundRectPath(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.12);
    ctx.fill();
    ctx.strokeStyle = '#5e3f24';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.95);
    ctx.lineTo(r * 0.95, r * 0.95);
    ctx.moveTo(r * 0.95, -r * 0.95);
    ctx.lineTo(-r * 0.95, r * 0.95);
    ctx.stroke();
  } else if (idx === 1) {
    // bamboo cluster
    for (const s of [-0.5, 0.18, 0.7] as const) {
      ctx.fillStyle = s === 0.18 ? '#7fb24a' : '#6a9a3e';
      roundRectPath(s * r - r * 0.2, -r * 1.05, r * 0.4, r * 2.0, r * 0.2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,20,.5)';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(s * r - r * 0.2, k * r * 0.55);
        ctx.lineTo(s * r + r * 0.2, k * r * 0.55);
        ctx.stroke();
      }
    }
  } else {
    // stone lantern
    ctx.fillStyle = '#8c8a96';
    roundRectPath(-r * 0.55, r * 0.2, r * 1.1, r * 0.75, r * 0.16);
    ctx.fill();
    ctx.fillStyle = '#a6a4b0';
    roundRectPath(-r * 0.75, -r * 0.35, r * 1.5, r * 0.6, r * 0.14);
    ctx.fill();
    // glowing aperture
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d7b88';
    roundRectPath(-r * 0.85, -r * 0.62, r * 1.7, r * 0.32, r * 0.1);
    ctx.fill();
  }
}

/**
 * Draw a spinning boomerang glyph at (x, y): a classic two-armed bent wing
 * (a thick rounded chevron), built by stroking the same V three times — a dark
 * outline, the body colour, then a centre highlight — so it reads as a rounded
 * arm rather than a flat shape. `glow` adds a coloured bloom for an in-flight
 * boomerang. `s` is the arm reach (the wing spans ~2·s).
 */
export function drawBoomShape(x: number, y: number, s: number, rot: number, color: string, glow = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the bent-wing path: two arms meeting at a rounded elbow (~90° spread)
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(-s * 0.95, -s * 0.42);
    ctx.lineTo(0, s * 0.52);
    ctx.lineTo(s * 0.95, -s * 0.42);
  };
  // dark outline for definition against the floor
  ctx.strokeStyle = 'rgba(0,0,0,.32)';
  ctx.lineWidth = s * 0.88;
  path();
  ctx.stroke();
  // coloured body (with an optional in-flight bloom)
  if (glow) {
    ctx.shadowBlur = s;
    ctx.shadowColor = color;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.72;
  path();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // centre highlight runs down each arm — sells the rounded, tumbling form
  ctx.strokeStyle = 'rgba(255,255,255,.32)';
  ctx.lineWidth = s * 0.22;
  path();
  ctx.stroke();
  ctx.restore();
}

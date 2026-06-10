import { ctx } from '../core/canvas';
import { roundRectPath } from '../gfx/shapes';

/**
 * Shared UI building blocks: the game's two typefaces plus panel / button /
 * keycap painters, so every screen (menu, HUD, pause, match-over) speaks the
 * same visual language.
 */

/** Chunky display face for titles & buttons (bundled via @fontsource). */
export const DISPLAY = '"Lilita One","Arial Rounded MT Bold","Trebuchet MS",sans-serif';
/** Friendly body face for labels & paragraphs. */
export const BODY = '"Nunito Variable","Nunito","Trebuchet MS","Segoe UI",sans-serif';

export const fontD = (px: number): string => `${px}px ${DISPLAY}`;
export const fontB = (px: number, weight = 700): string => `${weight} ${px}px ${BODY}`;

export const UI = {
  ink: '#140c20',
  cream: '#fff3df',
  dim: '#bda4cf',
  gold: '#ffce54',
  green: '#7ad06d',
  red: '#ff5d6c',
  panel: 'rgba(20,12,31,.95)',
  panelLite: 'rgba(255,255,255,.07)',
} as const;

/** Big display text with the game's signature dark outline. */
export function titleText(text: string, x: number, y: number, px: number, fill: string = UI.gold, strokePx?: number): void {
  ctx.font = fontD(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokePx ?? Math.max(3, px * 0.16);
  ctx.strokeStyle = UI.ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** A rounded panel with drop shadow and a soft top sheen. */
export function panel(x: number, y: number, w: number, h: number, r = 16): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  roundRectPath(x + 3, y + 5, w, h, r);
  ctx.fill();
  ctx.fillStyle = UI.panel;
  roundRectPath(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,243,223,.14)';
  ctx.lineWidth = 1.5;
  roundRectPath(x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  const sheen = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,.05)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRectPath(x, y, w, h * 0.5, r);
  ctx.fill();
  ctx.restore();
}

export interface ButtonStyle {
  hover?: boolean;
  primary?: boolean; // big green CTA
  danger?: boolean;
  px?: number; // label size
  disabled?: boolean;
}

/** A chunky game button. Caller registers the hit area; this only paints. */
export function button(x: number, y: number, w: number, h: number, label: string, st: ButtonStyle = {}): void {
  const { hover = false, primary = false, danger = false, disabled = false } = st;
  const px = st.px ?? Math.min(26, h * 0.52);
  const lift = hover && !disabled ? 2 : 0;
  ctx.save();
  ctx.translate(0, -lift);
  // base shadow
  ctx.fillStyle = UI.ink;
  roundRectPath(x, y + 4 + lift, w, h, 14);
  ctx.fill();
  let face = primary ? (hover ? '#9ae57f' : UI.green) : danger ? (hover ? '#ff7f8d' : UI.red) : hover ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.13)';
  if (disabled) face = 'rgba(255,255,255,.07)';
  ctx.fillStyle = face;
  roundRectPath(x, y, w, h, 14);
  ctx.fill();
  if (primary || danger) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    roundRectPath(x, y, w, h, 14);
    ctx.fill();
  }
  ctx.strokeStyle = primary || danger ? 'rgba(20,12,32,.55)' : 'rgba(255,243,223,.2)';
  ctx.lineWidth = 2;
  roundRectPath(x, y, w, h, 14);
  ctx.stroke();
  ctx.font = fontD(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (primary || danger) {
    ctx.fillStyle = UI.ink;
  } else {
    ctx.fillStyle = disabled ? 'rgba(255,243,223,.3)' : UI.cream;
  }
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

/** A keyboard keycap chip (for control hints). Returns its width. */
export function keycap(x: number, y: number, label: string, h = 24): number {
  ctx.save();
  ctx.font = fontB(h * 0.52, 800);
  const w = Math.max(h, ctx.measureText(label).width + h * 0.6);
  ctx.fillStyle = '#0d0816';
  roundRectPath(x, y + 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#3a2c4e';
  roundRectPath(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#574668';
  roundRectPath(x + 1.5, y + 1.5, w - 3, h - 3 - h * 0.18, 5);
  ctx.fill();
  ctx.fillStyle = UI.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 - 1);
  ctx.restore();
  return w;
}

/** Small pill of dimmed text (section banners, footnotes). */
export function pill(cx: number, y: number, text: string, px = 13, color: string = UI.dim): void {
  ctx.save();
  ctx.font = fontB(px, 800);
  const w = ctx.measureText(text).width + 26;
  ctx.fillStyle = 'rgba(13,8,22,.66)';
  roundRectPath(cx - w / 2, y, w, px + 12, (px + 12) / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + (px + 12) / 2 + 0.5);
  ctx.restore();
}

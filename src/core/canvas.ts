import { W, H } from '../constants';

/**
 * The single canvas + 2D rendering context used by every draw routine.
 * Imported wherever rendering happens so modules share one `ctx`.
 *
 * The backing store is scaled by devicePixelRatio (capped at 2) so the art
 * stays crisp on HiDPI displays; all game code keeps drawing in the logical
 * 1024×640 space via a persistent base scale on the context.
 */

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

export const DPR = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.scale(DPR, DPR);

/** Make a same-size offscreen layer whose context draws in logical coords. */
export function makeLayer(): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = W * DPR;
  cv.height = H * DPR;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.scale(DPR, DPR);
  return { cv, c };
}

/** Blit a layer made by `makeLayer` back onto the main context 1:1. */
export function blitLayer(cv: HTMLCanvasElement): void {
  ctx.drawImage(cv, 0, 0, W, H);
}

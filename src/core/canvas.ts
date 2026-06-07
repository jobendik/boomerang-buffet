/**
 * The single canvas + 2D rendering context used by every draw routine.
 * Imported wherever rendering happens so modules share one `ctx`.
 */

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

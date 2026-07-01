import { canvas } from './canvas';
import { audio } from './audio';
import { W, H } from '../constants';

/**
 * Keyboard, mouse and basic touch input. Listeners are registered on import.
 * Edge flags (`downEdge`/`upEdge`) live on the `mouse` object so the game loop
 * can clear them each frame (exported `let` bindings are read-only to importers).
 */

export const keys: Record<string, boolean> = {};

export const mouse = {
  x: W / 2,
  y: H / 2,
  down: false,
  rdown: false,
  downEdge: false,
  upEdge: false,
};

function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * W,
    y: ((clientY - r.top) / r.height) * H,
  };
}

canvas.addEventListener('mousemove', (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  mouse.x = p.x;
  mouse.y = p.y;
});
canvas.addEventListener('mousedown', (e) => {
  audio.unlock();
  if (e.button === 0) {
    mouse.down = true;
    mouse.downEdge = true;
  }
  if (e.button === 2) {
    mouse.rdown = true;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    if (mouse.down) mouse.upEdge = true;
    mouse.down = false;
  }
  if (e.button === 2) {
    mouse.rdown = false;
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (!keys[e.code]) keys[e.code + '_edge'] = true;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') audio.toggleMute();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouse.down = false;
  mouse.rdown = false;
});

// touch (basic): tap to advance menus / throw toward tap
canvas.addEventListener(
  'touchstart',
  (e) => {
    audio.unlock();
    const t = e.touches[0];
    const p = screenToWorld(t.clientX, t.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.downEdge = true;
    e.preventDefault();
  },
  { passive: false }
);
canvas.addEventListener(
  'touchmove',
  (e) => {
    const t = e.touches[0];
    const p = screenToWorld(t.clientX, t.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    e.preventDefault();
  },
  { passive: false }
);
canvas.addEventListener(
  'touchend',
  (e) => {
    if (mouse.down) mouse.upEdge = true;
    mouse.down = false;
    e.preventDefault();
  },
  { passive: false }
);

/** Clear per-frame edge flags. Call at the end of each game-loop tick. */
export function clearInputEdges(): void {
  mouse.downEdge = false;
  mouse.upEdge = false;
  for (const k in keys) if (k.endsWith('_edge')) keys[k] = false;
}

/* --------------------------- gamepad support ------------------------------ */
/**
 * Standard-mapping gamepad support (Xbox/PS-layout pads, including the PS5
 * DualSense controller as exposed by Chrome/Edge/Firefox). The Gamepad API
 * has no "value changed" events, so pads must be polled fresh every frame
 * via `navigator.getGamepads()` — cached Gamepad objects go stale.
 */

const GAMEPAD_DEADZONE = 0.22;

function axis(v: number): number {
  return Math.abs(v) < GAMEPAD_DEADZONE ? 0 : v;
}

function pressed(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  return !!b && b.pressed;
}

export interface PadIntents {
  move: [number, number];
  /** Right-stick aim direction, or null if it's centered (not pushed). */
  aim: [number, number] | null;
  throwHeld: boolean;
  dash: boolean;
  slash: boolean;
  jump: boolean;
}

/** Poll the gamepad at `padIndex` (order they connected in). Returns null if
 *  nothing is plugged in at that slot. */
export function readGamepad(padIndex: number): PadIntents | null {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[padIndex];
  if (!pad || !pad.connected) return null;
  const mx = axis(pad.axes[0] ?? 0);
  const my = axis(pad.axes[1] ?? 0);
  const rx = axis(pad.axes[2] ?? 0);
  const ry = axis(pad.axes[3] ?? 0);
  return {
    move: [mx, my],
    aim: rx || ry ? [rx, ry] : null,
    // face button (Cross/A) or right trigger: throw (hold to charge)
    throwHeld: pressed(pad, 0) || pressed(pad, 7),
    // West face button (Square/X) or right bumper: dash
    dash: pressed(pad, 2) || pressed(pad, 5),
    // East face button (Circle/B): slash / parry
    slash: pressed(pad, 1),
    // North face button (Triangle/Y): jump
    jump: pressed(pad, 3),
  };
}

/** Whether at least one gamepad is currently connected. */
export function anyGamepadConnected(): boolean {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return true;
  return false;
}

window.addEventListener('gamepadconnected', () => audio.unlock());

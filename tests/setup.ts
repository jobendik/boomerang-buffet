/**
 * Test-environment shims. The game's modules bind a shared 2D canvas context
 * at import time (`src/core/canvas.ts`), so before anything imports them we
 * plant a `<canvas id="game">` and stub `getContext` with a no-op recorder.
 * Audio needs nothing: the WebAudio synth is lazily created on user gesture
 * and every method guards on the context existing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeCtxStub(): any {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'canvas') return { width: 1024, height: 640 };
        return (..._args: unknown[]) => {
          if (typeof prop === 'string' && prop.startsWith('create')) return gradient;
          if (prop === 'measureText') return { width: 0 };
          if (prop === 'isPointInPath') return false;
          return undefined;
        };
      },
      set() {
        return true; // swallow fillStyle/lineWidth/… assignments
      },
    }
  );
}

(HTMLCanvasElement.prototype as any).getContext = () => makeCtxStub();
document.body.innerHTML = '<canvas id="game"></canvas>';

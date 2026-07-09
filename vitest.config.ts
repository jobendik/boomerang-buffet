import { defineConfig } from 'vitest/config';

// Headless test runner: the game's pure simulation (update loop, AI, combat,
// power-ups) runs under jsdom with a stubbed 2D canvas context, so matches can
// be fast-forwarded programmatically — see tests/sim.ts for the harness.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});

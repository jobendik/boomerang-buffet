import { defineConfig } from 'vite';

// Relative base so the build works when hosted from a sub-path
// (e.g. GitHub Pages / itch.io) as well as the domain root.
export default defineConfig({
  base: './',
  server: {
    open: true,
    host: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
});

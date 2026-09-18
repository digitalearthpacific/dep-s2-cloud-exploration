import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, not absolute: GitHub Pages serves this as a project page under
  // /<repo-name>/, not the domain root, and relative asset URLs work at any subpath
  // without hardcoding the repo name here.
  base: './',
  server: { host: '127.0.0.1', port: 5173, open: false },
  build: { target: 'es2022', sourcemap: true },
  worker: { format: 'es' },
  optimizeDeps: {
    // maplibre-gl v6 ships its worker as an ES module that Vite's dep-optimizer
    // can't rewrite cleanly (same workaround as cogniscient).
    exclude: ['maplibre-gl'],
  },
});

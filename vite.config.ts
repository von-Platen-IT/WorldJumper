import { defineConfig } from 'vite';

// Keep the build root-relative agnostic so the produced bundle can be served
// from a plain static host or opened through `vite preview` without a backend.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
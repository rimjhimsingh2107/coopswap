import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const apiTarget = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // bundle shared from source so the web build doesn't need it prebuilt
      '@coopswap/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // maplibre is ~800kb on its own; keep it out of everything that isn't a map
        manualChunks: (id: string) => (id.includes('maplibre-gl') ? 'maplibre' : undefined),
      },
    },
    // the maplibre chunk is ~1mb and only loads on map pages
    chunkSizeWarningLimit: 1100,
  },
  server: {
    port: 5173,
    // proxy keeps the api same-origin in dev so cookies are first party
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});

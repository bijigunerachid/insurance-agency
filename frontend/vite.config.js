import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser always talks to its own origin; /api is forwarded to the backend,
// exactly as the production reverse proxy does.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
    // One test can wait several times for asyncUtilTimeout (5 s, test/setup.js); on a busy
    // laptop the default 5 s per test ran out before any assertion failed.
    testTimeout: 20_000,
  },
});

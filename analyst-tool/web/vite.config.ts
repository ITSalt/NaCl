import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Excalidraw's bundled build references process.env.NODE_ENV; polyfill for browsers.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
  },
  server: {
    port: 3582,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3583',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3583',
        ws: true,
      },
    },
  },
});

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' keeps every asset URL relative, so the built app runs from any
// folder or static host (and from a sub-path) without configuration.
export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  base: './',
  plugins: [preact()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});

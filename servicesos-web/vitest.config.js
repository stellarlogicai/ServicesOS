import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    // Keep concurrent jsdom suites below the point where five-second test-local timeouts become CPU-bound.
    maxWorkers: 4,
  },
});

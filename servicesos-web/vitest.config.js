import process from 'node:process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const nodeMajor = Number(process.versions.node.split('.')[0]);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    // Keep Node's process-wide experimental Web Storage out of jsdom workers.
    // Vitest otherwise preserves Node's incomplete accessor over jsdom Storage.
    execArgv: nodeMajor >= 22 ? ['--no-experimental-webstorage'] : [],
    // Keep concurrent jsdom suites below the point where five-second test-local timeouts become CPU-bound.
    maxWorkers: 4,
  },
});

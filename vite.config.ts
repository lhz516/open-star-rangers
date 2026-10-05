import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { complianceBuildPlugin } from './tools/compliance/build-plugin.ts';

export default defineConfig({
  plugins: [react(), complianceBuildPlugin()],
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  // P2-04: import Workers are module Workers with the page's ES module semantics.
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
  },
});

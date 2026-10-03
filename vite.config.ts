import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { complianceBuildPlugin } from './tools/compliance/build-plugin.ts';

export default defineConfig({
  plugins: [react(), complianceBuildPlugin()],
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});

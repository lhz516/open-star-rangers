import { globSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { complianceBuildPlugin } from './tools/compliance/build-plugin.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from './tools/preview-csp.ts';

const testFiles = ['src/**/*.test.ts', 'tools/**/*.test.ts'];
// vi.mock replaces a module only in a file's own module graph, so files that mock run isolated. The others share one
// module graph per worker instead of starting a fresh one for every file, which dominated the run time.
const mockingFiles = globSync(testFiles, { cwd: import.meta.dirname }).sort()
  .filter(file => /^vi\.mock\(/m.test(readFileSync(new URL(file, import.meta.url), 'utf8')));

export default defineConfig({
  plugins: [react(), complianceBuildPlugin()],
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  server: {
    // Transform the page and import Worker graphs when the server starts rather than on first request, which delayed
    // the first page and import job, such as those of the first browser tests on a fresh server. Workers load by URL,
    // so their graphs are not reached from the page; the test entries and that Worker are what the browser tests load.
    warmup: {
      clientFiles: ['./index.html', './src/workers/import-worker.ts', './e2e/entries/*.html', './src/workers/import-worker.test-support.ts'],
    },
  },
  // P2-04: import Workers are module Workers with the page's ES module semantics.
  worker: {
    format: 'es',
  },
  // P2-11: the local production preview, and every production browser test, runs under the strict policy.
  preview: {
    headers: { 'Content-Security-Policy': PREVIEW_CONTENT_SECURITY_POLICY },
  },
  test: {
    environment: 'node',
    // Leave half the cores to the build tools the integration tests spawn and to other concurrent checks.
    maxWorkers: '50%',
    restoreMocks: true,
    // Projects inherit this configuration but own their `include`, which would otherwise be concatenated.
    projects: [
      { extends: true, test: { name: 'shared', include: testFiles, exclude: [...configDefaults.exclude, ...mockingFiles], isolate: false } },
      { extends: true, test: { name: 'isolated', include: mockingFiles } },
    ],
  },
});

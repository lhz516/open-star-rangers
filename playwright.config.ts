import { defineConfig } from '@playwright/test';
import { devOrigin, devPort, installedBrowser, previewOrigin, previewPort } from './e2e/support/environment.ts';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    browserName: 'chromium',
    launchOptions: installedBrowser(),
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // New specs choose their project by name: `*.development.spec.ts` and `*.production.spec.ts` run only there; the
  // explicit lists below keep the older specs' assignments.
  projects: [
    {
      name: 'development',
      testIgnore: ['**/*.production.spec.ts', '**/native-lifecycle.spec.ts', '**/compliance-assets.spec.ts', '**/production-preview.spec.ts'],
      use: { baseURL: devOrigin },
    },
    {
      name: 'production',
      testIgnore: [
        '**/*.development.spec.ts',
        '**/native-lifecycle.spec.ts', '**/browser-replay.spec.ts', '**/import-worker.spec.ts', '**/resource-cache.spec.ts', '**/audio-playback.spec.ts',
        '**/app-shell-resources.spec.ts', '**/import-page.spec.ts', '**/viewer-page.spec.ts', '**/cache-recovery.spec.ts', '**/fast-refresh.spec.ts',
      ],
      use: { baseURL: previewOrigin },
    },
    {
      name: 'development-headed',
      testMatch: '**/native-lifecycle.spec.ts',
      use: { baseURL: devOrigin, launchOptions: installedBrowser(false) },
    },
  ],
  webServer: [
    {
      command: `pnpm dev --host 127.0.0.1 --port ${devPort} --strictPort`,
      url: devOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
      url: previewOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

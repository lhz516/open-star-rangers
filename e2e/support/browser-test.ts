import { expect, test as base, type Page } from '@playwright/test';
import { installBrowserProbes } from './browser-probes.ts';

export { expect } from '@playwright/test';

/** Every console message of the page and its Workers, any level, for privacy checks. */
export function consoleText(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', message => { seen.push(message.text()); });
  page.on('worker', worker => { worker.on('console', message => { seen.push(message.text()); }); });
  return seen;
}
export function collectBrowserErrors(page: Page, webglUnavailable = false) {
  const errors: string[] = [];
  const allowed: string[] = [];
  page.on('pageerror', error => { errors.push(`pageerror: ${error.message}`); });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const url = message.location().url;
    if ((url.endsWith('/favicon.ico') && text.includes('404'))
      || (webglUnavailable && [
        'THREE.WebGLRenderer: Error creating WebGL context.',
        'THREE.WebGLRenderer: THREE.WebGLRenderer: Error creating WebGL context.',
        'THREE.WebGLRenderer: A WebGL context could not be created. Reason:  disabled by enterprise policy or commandline switch',
      ].includes(text))) {
      allowed.push(`${url}: ${text}`);
    } else errors.push(`console: ${url}: ${text}`);
  });
  // Playwright reports a Worker's console on the Worker, not on the page.
  page.on('worker', worker => {
    const entry = new URL(worker.url()).pathname;
    worker.on('console', message => { if (message.type() === 'error') errors.push(`worker console: ${entry}: ${message.text()}`); });
  });
  page.on('requestfailed', request => { errors.push(`request: ${request.url()}: ${request.failure()?.errorText}`); });
  page.on('response', response => {
    if (response.status() < 400) return;
    if (new URL(response.url()).pathname === '/favicon.ico' && response.status() === 404) allowed.push('favicon.ico: 404');
    else errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return { errors, allowed };
}

/**
 * Splits the observed errors into declared diagnostics, each matched by one exactly equal error, unexpected errors, and
 * declared diagnostics that never occurred.
 */
export function settleDiagnostics(observed: readonly string[], declared: readonly string[]) {
  const pending = [...declared];
  const matched: string[] = [];
  const unexpected: string[] = [];
  for (const error of observed) {
    const index = pending.indexOf(error);
    if (index === -1) unexpected.push(error);
    else matched.push(...pending.splice(index, 1));
  }
  return { matched, unexpected, missing: pending };
}

export const test = base.extend<{
  webglUnavailable: boolean;
  declaredDiagnostics: string[];
  /** Declares one browser error, in the collector's exact wording, that this test must produce; it is then recorded. */
  expectDiagnostic: (diagnostic: string) => void;
  observeErrors: void;
}>({
  webglUnavailable: [false, { option: true }],
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a fixture to destructure its first argument.
  declaredDiagnostics: async ({}, use) => { await use([]); },
  expectDiagnostic: async ({ declaredDiagnostics }, use) => { await use(diagnostic => { declaredDiagnostics.push(diagnostic); }); },
  observeErrors: [async ({ page, webglUnavailable, declaredDiagnostics }, use, testInfo) => {
    const { errors, allowed } = collectBrowserErrors(page, webglUnavailable);
    await page.addInitScript(installBrowserProbes);
    try {
      await use();
    } finally {
      try {
        const { matched, unexpected, missing } = settleDiagnostics(errors, declaredDiagnostics);
        for (const diagnostic of matched) testInfo.annotations.push({ type: 'expected-diagnostic', description: diagnostic });
        await testInfo.attach('browser-errors', { body: JSON.stringify({ errors: unexpected, declared: matched, missing, allowed }), contentType: 'application/json' });
        expect(unexpected, 'Unexpected browser errors').toEqual([]);
        expect(missing, 'Declared diagnostics that did not occur').toEqual([]);
        // The formal application's failures no case expects; a start refusal (`mission-start-failure`) is an expected outcome.
        for (const name of ['cleanup-failure', 'open-mission-failure', 'mission-open-failure', 'mission-action-error', 'mission-placeholder-failure']) {
          expect(await page.getByTestId(name).count(), `Unexpected ${name}`).toBe(0);
        }
      } finally {
        await page.evaluate(() => { window.osrProbe?.restore(); });
      }
    }
  }, { auto: true }],
});

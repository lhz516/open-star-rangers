import { expect, test as base, type Page } from '@playwright/test';
import { installBrowserProbes } from './browser-probes.ts';

export { expect } from '@playwright/test';
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
  page.on('requestfailed', request => { errors.push(`request: ${request.url()}: ${request.failure()?.errorText}`); });
  page.on('response', response => {
    if (response.status() < 400) return;
    if (new URL(response.url()).pathname === '/favicon.ico' && response.status() === 404) allowed.push('favicon.ico: 404');
    else errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return { errors, allowed };
}

export const test = base.extend<{ webglUnavailable: boolean; observeErrors: void }>({
  webglUnavailable: [false, { option: true }],
  observeErrors: [async ({ page, webglUnavailable }, use, testInfo) => {
    const { errors, allowed } = collectBrowserErrors(page, webglUnavailable);
    await page.addInitScript(installBrowserProbes);
    try {
      await use();
    } finally {
      try {
        await testInfo.attach('browser-errors', { body: JSON.stringify({ errors, allowed }), contentType: 'application/json' });
        expect(errors, 'Unexpected browser errors').toEqual([]);
        for (const name of ['action-error', 'session-error', 'cleanup-failure', 'open-demo-failure']) {
          expect(await page.getByTestId(name).count(), `Unexpected ${name}`).toBe(0);
        }
      } finally {
        await page.evaluate(() => { window.osrProbe?.restore(); });
      }
    }
  }, { auto: true }],
});

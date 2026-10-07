import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { discFiles, expectNoPlayClaim, type FilePayload } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import { ordinaryFiles } from '../tools/compliance/distribution.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { productionSizedFiles } from '../src/workers/synthetic-import.test-support.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';

// P2-11 S-11 and AC-19 (without the viewer path): the local production preview under its strict Content Security
// Policy. The real import Worker identifies production-sized synthetic files as an unsupported version; a missing or
// HTML-replaced Worker script fails the import safely. Production project only.

const WORKER = '**/assets/import-worker-*.js';

/** Records every `securitypolicyviolation` the page reports, before any page script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);
const workers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers.map(({ entry, viteWorker, type, terminations }) => ({ entry, viteWorker, type, terminations })));

let productionSized: Promise<FilePayload[]> | undefined;

/** Imports synthetic files at the production whitelist's paths and sizes, generated once for this file. */
async function importFiles(page: Page): Promise<void> {
  const files = await (productionSized ??= discFiles(productionSizedFiles()));
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await page.locator('#import-files').setInputFiles([...files]);
  await page.getByRole('button', { name: 'Start import', exact: true }).click();
}

test('the real import Worker, sent with the policy like the page, is a hashed module script under /assets/ and reports synthetic files as an unsupported version', async ({ page }) => {
  await recordViolations(page);
  const document = await page.goto('/');
  expect(document?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  const script = page.waitForResponse(WORKER);
  await importFiles(page);
  const response = await script;
  expect(response.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^(?:text|application)\/javascript\b/);
  const failure = page.getByTestId('import-failure');
  await expect(failure).toHaveAttribute('data-category', 'source/version');
  await expect(failure).toContainText('not a supported version of Star Rangers');
  await expect(failure.locator('dd').nth(1)).toHaveText('unsupported-version');
  // Vite's Worker transform emitted the hashed script and the page chunk's `new URL(…, import.meta.url)`; the
  // development server's `worker_file` marker does not exist in a build.
  const [worker, ...others] = await workers(page);
  expect(others).toEqual([]);
  expect(worker).toEqual({ entry: expect.stringMatching(/^\/assets\/import-worker-[\w-]+\.js$/), viteWorker: false, type: 'module', terminations: 1 });
  expect(new URL(response.url()).pathname).toBe(worker.entry);
  const page_ = await page.request.get('/');
  const chunk = (await page_.text()).match(/src="(\/assets\/index-[\w-]+\.js)"/)![1];
  expect(await (await page.request.get(chunk)).text()).toContain(`new Worker(new URL(\`${worker.entry}\`,\`\`+import.meta.url),{type:\`module\`})`);
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  expect(await violations(page)).toEqual([]);
});

for (const [name, fulfill] of [
  ['missing (404)', { status: 404, contentType: 'text/plain', body: 'Not Found' }],
  ['replaced by the HTML fallback', { status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }],
] as const) {
  test(`a Worker script ${name} fails the import at the import layer and keeps no package`, async ({ page, expectDiagnostic }) => {
    await recordViolations(page);
    await page.route(WORKER, route => route.fulfill(fulfill));
    // Chrome's own reports of the failed script load, which it does not always make; the page itself adds nothing.
    const reports: string[] = [];
    page.on('console', message => { if (message.type() === 'error') reports.push(`console: ${message.location().url}: ${message.text()}`); });
    page.on('requestfailed', request => { reports.push(`request: ${request.url()}: ${request.failure()?.errorText}`); });
    await page.goto('/');
    const script = page.waitForResponse(WORKER);
    await importFiles(page);
    const url = (await script).url();
    const failure = page.getByTestId('import-failure');
    await expect(failure).toHaveAttribute('data-category', 'import/worker-start');
    await expect(failure.locator('dd').first()).toHaveText('import');
    await expect(failure.locator('dd').nth(1)).toHaveText('worker-start-failed');
    expect((await workers(page)).map(({ terminations }) => terminations)).toEqual([1]);
    await expect(page.getByTestId('import-statuses')).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
    expect(await violations(page)).toEqual([]);
    if (fulfill.status === 404) expectDiagnostic(`HTTP 404: ${url}`);
    const browserReports = [
      `console: ${url}: Failed to load resource: the server responded with a status of 404 (Not Found)`,
      `request: ${url}: net::ERR_FAILED`,
    ];
    for (const report of reports) {
      expect(browserReports, report).toContain(report);
      expectDiagnostic(report);
    }
  });
}

test('the menu, import page and synthetic demo run under the policy without a violation', async ({ page }) => {
  await recordViolations(page);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await page.getByRole('button', { name: 'Start synthetic demo', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('running');
  await expect(page.getByTestId('render-status')).toHaveAttribute('data-state', 'ready');
  await expectNoPlayClaim(page);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  expect(await violations(page)).toEqual([]);
});

test('the build holds one page and no test entry, test support or synthetic catalog', () => {
  const root = join(import.meta.dirname, '..');
  const dist = join(root, 'dist');
  const files = ordinaryFiles(root, 'dist').map(path => path.slice('dist/'.length));
  expect(files.filter(file => file.endsWith('.html'))).toEqual(['index.html']);
  const sources = files.filter(file => file.endsWith('.map'))
    .flatMap(file => (JSON.parse(readFileSync(join(dist, file), 'utf8')) as { sources: string[] }).sources);
  expect(sources.length).toBeGreaterThan(100);
  expect(sources.filter(source => /\.test(?:-support)?\.tsx?$|\/e2e\/|app-entry/.test(source))).toEqual([]);
  for (const file of files.filter(file => /\.(?:js|html)$/.test(file))) {
    const text = readFileSync(join(dist, file), 'utf8');
    for (const marker of [MARKER, 'osrTestEntry', 'synthetic-browser', 'synthetic-models', 'import-worker.test-support']) {
      expect(text.includes(marker), `${file} contains ${marker}`).toBe(false);
    }
  }
});

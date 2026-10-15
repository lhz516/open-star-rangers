import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Page } from '@playwright/test';
import { button, chooserInput, discFiles, expectNoPlayClaim, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { test, expect } from './support/browser-test.ts';
import { test as audited } from './support/audited-test.ts';
import { endPlaceholder, enterMission, expectAdvancingTick, expectFlightCursorWithoutWebGL, missionEntry, missionFrame } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { entryButton, expectSamples, firstEntry, pictureOf, pictureSamples, solidSamples, viewerDiagnostics } from './support/viewer-observations.ts';
import { ordinaryFiles } from '../tools/compliance/distribution.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { productionSizedFiles } from '../src/workers/synthetic-import.test-support.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import { CHECKER_GREYS } from '../src/render/viewer/viewer-presentation.ts';

// P2-11 S-11 and AC-19: the local production preview under its strict Content Security
// Policy. The real import Worker identifies production-sized synthetic files as an unsupported version; a missing or
// HTML-replaced Worker script fails the import safely. Production project only.
// The two Worker script fallback cases run with the P2-12 network audit (subtask 07, AC-08 and AC-10): the test's own
// replaced script is declared as a test request with its expected status, and nothing else is exempted.
// P3-04 (docs/plan/p3/04/spec.md, 合成演示退役 and 开发诊断; AC-15 and the production part of AC-22) replaces the synthetic
// demo with the mission flow, started from the startable mission package seeded into the test's own context, under the
// policy and the network audit; the build and its source maps hold no development diagnostics or test support, and the
// production DOM shows no diagnostics panel. The whole production flow is in mission-flow.production.spec.ts.

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

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** The production DOM holds no development diagnostics: no panel, state, log, frame statistics, command editor or export. */
async function expectNoDiagnostics(page: Page): Promise<void> {
  expect(await page.evaluate(() => ({
    elements: document.querySelectorAll('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').length,
    buttons: [...document.querySelectorAll('button')].map(({ textContent }) => textContent?.trim()).filter(name => name === 'Refresh state' || name === 'Submit command' || name === 'Export recording'),
  }))).toEqual({ elements: 0, buttons: [] });
}

let productionSized: Promise<FilePayload[]> | undefined;

/** Imports synthetic files at the production whitelist's paths and sizes, generated once for this file. */
async function importFiles(page: Page): Promise<void> {
  const files = await (productionSized ??= discFiles(productionSizedFiles()));
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await page.locator('#import-files').setInputFiles(await chooserInput(files));
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
  audited(`a Worker script ${name} fails the import at the import layer and keeps no package`, async ({ page, expectDiagnostic, audit }) => {
    audit.declare({ label: `Worker script ${name}`, method: 'GET', path: /^\/assets\/import-worker-[\w-]+\.js$/, expect: fulfill.status });
    // The chosen files' names carry the marker; it must not leave the browser either.
    audit.canaries({ name: 'file-name', value: MARKER });
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

audited('the menu, import page and mission flow from a restored cache run under the policy and the network audit without a violation, and show no diagnostics', async ({ page }) => {
  // Converted in Node while the page loads.
  const mission = missionPackage();
  await recordViolations(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await button(page, 'Return to menu').click();
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await expectNoPlayClaim(page);

  const { owner } = await enterMission(page);
  await expectNoDiagnostics(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await expectNoDiagnostics(page);
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  await expectAdvancingTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner, run: 1, position: 'flight' });
  // The mission flow creates no WebGL surface; the flight view is P3-12's.
  await expectFlightCursorWithoutWebGL(page);
  await expectNoDiagnostics(page);
  await expectNoPlayClaim(page);
  await button(page, 'Mission menu').click();
  await expectNoDiagnostics(page);
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await workers(page)).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('restores synthetic cached resources through the production menu, renders them and auditions audio under the policy', async ({ page }) => {
  await recordViolations(page);
  await page.addInitScript(installAudioProbe);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page);
  expect(await violations(page)).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED);
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  for (const kind of ['model', 'image', 'layout'] as const) {
    const { entry, resolved } = await firstEntry(kind, kind === 'model' ? 'enemy-ship' : undefined);
    await entryButton(page, entry.id).click();
    await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${entry.id}`);
    const { state, layout, placement } = await viewerDiagnostics(page);
    expect(state).toBe('ready');
    const item = resolved.item(0)!;
    const samples = kind === 'model' ? solidSamples(item, layout!) : pictureSamples(pictureOf(item), placement!);
    if (kind !== 'model') {
      // Sparse layouts can put every grid sample on transparency. Add a real opaque texel, not checkerboard evidence.
      const { width, height, rgba } = pictureOf(item);
      const at = rgba.findIndex((alpha, index) => index % 4 === 3 && alpha === 255
        && !CHECKER_GREYS.some(grey => rgba.subarray(index - 3, index).every(channel => channel === grey)));
      expect(at, `${entry.id} contains an opaque texel`).toBeGreaterThanOrEqual(3);
      const texel = (at - 3) / 4;
      samples.push({
        x: Math.floor(placement!.left + ((texel % width + 0.5) * placement!.width) / width),
        y: Math.floor(placement!.top + ((Math.floor(texel / width) + 0.5) * placement!.height) / height),
        rgb: [rgba[at - 3], rgba[at - 2], rgba[at - 1]],
      });
    }
    expect(samples.some(({ rgb }) => rgb.some(channel => channel > 0 && channel < 255)), `${entry.id} has mid-tone samples`).toBe(true);
    expect(samples.some(({ rgb }) => !CHECKER_GREYS.some(grey => rgb.every(channel => channel === grey))),
      `${entry.id} has visible content, not only the transparency background`).toBe(true);
    await expectSamples(page, layout!, samples);
  }
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  expect(await page.evaluate(() => window.osrAudioProbe.contexts())).toEqual([]);
  await page.getByTestId('viewer-sounds').getByRole('button', { name: /^Play / }).first().click();
  await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'running');
  // The synthetic sounds last less than a millisecond; observe the source start instead of a transient voice count.
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.started())).toBe(1);
  await button(page, 'Stop all sounds').click();
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed())).toBe(0);
  await expectNoPlayClaim(page);
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
  await button(page, 'Return to menu').click();
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.contexts())).toEqual(['closed']);
  expect(await workers(page)).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

/**
 * Development-only modules (docs/plan/p3/04/spec.md, 开发诊断: 生产边界), each with strings only it puts in a bundle: the
 * diagnostics panel with its state, event log, frame statistics, command editor and recording export; the frame timing
 * that measures the session's frames; the recording download, its file adapter and the application version that labels
 * a recording.
 */
const DEVELOPMENT_ONLY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'src/ui/dev/MissionDevPanel.tsx': ['mission-dev-panel', 'dev-state-run', 'dev-entities', 'dev-log', 'dev-frames', 'dev-command-submit', 'dev-recording-export'],
  'src/ui/dev/mission-diagnostics.ts': [],
  'src/ui/dev/event-log.ts': [],
  'src/ui/dev/frame-stats.ts': [],
  'src/ui/dev/command-draft.ts': [],
  'src/ui/dev/entity-inspection.ts': [],
  'src/ui/dev/recording-export.ts': ['osr-recording-'],
  'src/app/mission/dev-frame-timing.ts': [],
  'src/platform/files/file-save.ts': [],
  'src/platform/files/browser-file-save.ts': ['createObjectURL'],
  'src/app/app-version.ts': [],
});

test('the build holds one page and no test entry, test support, synthetic demo or development diagnostics', () => {
  const root = join(import.meta.dirname, '..');
  const dist = join(root, 'dist');
  const files = ordinaryFiles(root, 'dist').map(path => path.slice('dist/'.length));
  expect(files.filter(file => file.endsWith('.html'))).toEqual(['index.html']);
  // Every source as a repository path; a map lists its sources relative to its own directory.
  const sources = files.filter(file => file.endsWith('.map')).flatMap(file => (JSON.parse(readFileSync(join(dist, file), 'utf8')) as { sources: string[] })
    .sources.map(source => relative(root, join(dist, dirname(file), source))));
  expect(sources.length).toBeGreaterThan(100);
  // The production mission owner is listed under the same path form the checks below exclude modules by.
  expect(sources).toContain('src/app/mission/mission-owner.ts');
  expect(sources.filter(source => /\.test(?:-support)?\.tsx?$|^e2e\/|app-entry/.test(source))).toEqual([]);
  // The retired P1 demo's chain (合成演示退役) and the development diagnostics are compiled out.
  expect(sources.filter(source => /^src\/(?:core|render)\/synthetic\/|^src\/.*\/(?:synthetic-[\w-]+|Synthetic\w+)\.tsx?$|^src\/ui\/dev\//.test(source))).toEqual([]);
  const markers = [MARKER, 'osrTestEntry', 'synthetic-browser', 'synthetic-models', 'import-worker.test-support'];
  for (const [module, strings] of Object.entries(DEVELOPMENT_ONLY)) {
    // Each module and string exists in the sources, so its absence from the build is not vacuous.
    const text = readFileSync(join(root, module), 'utf8');
    for (const marker of strings) expect(text, `${module} holds ${marker}`).toContain(marker);
    expect(sources, `the build contains ${module}`).not.toContain(module);
    markers.push(...strings);
  }
  for (const file of files.filter(file => /\.(?:js|html)$/.test(file))) {
    const text = readFileSync(join(dist, file), 'utf8');
    for (const marker of markers) {
      expect(text.includes(marker), `${file} contains ${marker}`).toBe(false);
    }
  }
});

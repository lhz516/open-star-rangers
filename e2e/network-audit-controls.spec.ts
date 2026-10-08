import type { Page } from '@playwright/test';
import type { AuditReport, Canary } from '../tools/e2e-network-policy.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { expect, test } from './support/audited-test.ts';
import { NativeTarget, until } from './support/native-lifecycle.ts';
import { loopbackReceiver, type LoopbackReceiver } from './support/network-audit.ts';

// P2-12 AC-11: control samples proving what the network audit sees, in both projects. Every sample carries a synthetic
// marker and goes only to a route this test answers, to the test-owned loopback receiver, or (in production, where the
// strict policy blocks other origins) to the local preview server; nothing reaches an external host. The audit must let
// the real page load through, detect every sample with the right initiator, phase and delivery, and tell attempts the
// Content Security Policy blocked from requests that left. These violations are the expected result of each case.

const CONTROL = '/__osr-audit/';
const MARKERS = {
  url: 'osr-audit-url-3f9c1a', header: 'osr-audit-header-7b2e4d', body: 'osr audit body 5a8f0c', beacon: 'osr-audit-beacon-0d61e2',
  image: 'osr-audit-image-c47b93', cookie: 'osr-audit-cookie-91a5f8', fragment: 'osr-audit-fragment-62de0b',
  workerUrl: 'osr-audit-worker-url-e3b7a4', workerHeader: 'osr-audit-worker-header-18c9d2', workerBody: 'osr-audit-worker-body-a07f5e',
  workerBlocked: 'osr-audit-worker-blocked-4c2b81', pageBlocked: 'osr-audit-page-blocked-d93e17', sent: 'osr-audit-sent-75f0ab',
  close: 'osr-audit-close-2b8e6f', popup: 'osr-audit-popup-e81d04', serviceWorker: 'osr-audit-service-worker-0c7a3e',
  native: 'osr-audit-native-9d4c07', nativeClose: 'osr-audit-native-close-6a1f38',
} as const;
const CANARIES: Canary[] = Object.entries(MARKERS).map(([name, value]) => ({ name, value }));

/**
 * A module Worker under the production policy: a marked same-origin request as soon as it starts, before any message,
 * then one to another origin, which its policy blocks.
 */
const WORKER_SOURCE = `const first = fetch('${CONTROL}worker-fetch?m=${MARKERS.workerUrl}', { method: 'POST', headers: { 'X-Osr-Audit': '${MARKERS.workerHeader}' }, body: '${MARKERS.workerBody}' })
  .then(async response => { await response.arrayBuffer(); return response.status; });
self.onmessage = async ({ data: receiver }) => {
  const outcome = [await first];
  try { await fetch(\`\${receiver}/worker-blocked?m=${MARKERS.workerBlocked}\`, { mode: 'no-cors' }); outcome.push('sent'); } catch { outcome.push('blocked'); }
  self.postMessage(outcome);
};`;

/** Answers the page's own control requests with a page route: a landing page, and an empty answer otherwise. */
async function routeControls(page: Page): Promise<void> {
  await page.route(url => ['fetch', 'beacon', 'pixel.png', 'landing.html'].some(name => url.pathname === `${CONTROL}${name}`), route => route.request().url().includes('.html')
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Audit control</title>' })
    : route.fulfill({ status: 204 }));
}

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
}

/** Each canary hit with how it was found and how far its request got. */
const hits = (report: AuditReport) => report.violations.flatMap(({ category, initiator, phase, delivery, canary, channel }) =>
  category === 'canary' && canary ? [{ ...canary, initiator, phase, channel, delivery }] : []);
const categories = (report: AuditReport, subject: string) => [...new Set(report.violations.filter(violation => violation.subject.includes(subject)).map(violation => violation.category))].sort();

let receiver: LoopbackReceiver;
test.beforeEach(async () => { receiver = await loopbackReceiver(); });
test.afterEach(async () => { await receiver.close(); });

test('the real page loads through the audit, and page fetch, beacon, image, cookie and fragment markers are detected as the page\'s', async ({ page, audit, baseURL }) => {
  const production = audit.mode === 'production';
  audit.canaries(...CANARIES);
  // Expected: every control request, the marked cookie wherever it goes, and the cookie still in the jar at the end.
  audit.expectViolations({ subject: new RegExp(`^${new URL(baseURL ?? '').origin}${CONTROL}`) }, { category: 'cookie' }, { category: 'canary', canary: { name: 'cookie' } });
  await routeControls(page);
  await openApp(page);
  const loaded = await audit.report();
  expect(loaded.violations).toEqual([]);
  expect(loaded.gaps).toEqual([]);
  const origin = new URL(page.url()).origin;
  const loads = loaded.allowed.filter(entry => entry.channel === 'request').map(({ kind, subject, initiator }) => ({ kind, path: new URL(subject).pathname, initiator }));
  expect(loads).toContainEqual({ kind: 'product', path: '/', initiator: 'page' });
  if (production) {
    expect(loads).toContainEqual({ kind: 'product', path: expect.stringMatching(/^\/assets\/index-[\w-]+\.js$/), initiator: 'page' });
    expect(loads).toContainEqual({ kind: 'product', path: expect.stringMatching(/^\/assets\/index-[\w-]+\.css$/), initiator: 'page' });
  } else {
    expect(loads).toContainEqual({ kind: 'toolchain', path: '/@vite/client', initiator: 'page' });
    expect(loads).toContainEqual({ kind: 'product', path: '/src/main.tsx', initiator: 'page' });
  }

  audit.phase('controls');
  await page.evaluate(async ({ control, markers }) => {
    const response = await fetch(`${control}fetch?m=${markers.url}`, { method: 'POST', headers: { 'X-Osr-Audit': btoa(markers.header) }, body: encodeURIComponent(markers.body) });
    await response.arrayBuffer();
    navigator.sendBeacon(`${control}beacon`, markers.beacon);
    await new Promise(resolve => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = `${control}pixel.png?m=${markers.image}`;
    });
    document.cookie = `osr-audit=${markers.cookie}; path=/`;
  }, { control: CONTROL, markers: MARKERS });
  audit.phase('reload');
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  audit.phase('navigation');
  await page.evaluate(({ control, marker }) => { location.assign(`${control}landing.html#${marker}`); }, { control: CONTROL, marker: MARKERS.fragment });
  await page.waitForURL(`**${CONTROL}landing.html#*`);

  const report = await audit.report();
  expect(hits(report)).toEqual(expect.arrayContaining([
    { name: 'url', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'header', location: 'header', encoding: 'base64', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'body', location: 'body', encoding: 'url', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'beacon', location: 'body', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'image', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'cookie', location: 'cookie', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'cookie', delivery: undefined },
    { name: 'cookie', location: 'cookie', encoding: 'raw', initiator: 'page', phase: 'reload', channel: 'request', delivery: 'sent' },
    { name: 'fragment', location: 'url', encoding: 'raw', initiator: 'page', phase: 'navigation', channel: 'navigation', delivery: undefined },
  ]));
  expect(categories(report, `${CONTROL}fetch`)).toEqual(['body', 'canary', 'method', 'path', ...production ? ['query'] : []].sort());
  expect(categories(report, `${CONTROL}beacon`)).toEqual(['body', 'canary', 'method', 'path']);
  expect(categories(report, `${CONTROL}pixel.png`)).toEqual(['canary', 'path', ...production ? ['query'] : []].sort());
  expect(categories(report, `${CONTROL}landing.html`)).toEqual(['canary', 'navigation', 'path']);
  expect(report.violations).toContainEqual(expect.objectContaining({ category: 'cookie', channel: 'cookie', initiator: 'page', detail: 'cookie write by script: osr-audit' }));
  expect(report.violations).toContainEqual(expect.objectContaining({ category: 'cookie', channel: 'request', subject: `${origin}/`, phase: 'reload', delivery: 'sent' }));
  expect(report.gaps).toEqual([]);
});

test('a dedicated Worker\'s requests are the Worker\'s, and the attempts the policy blocked are told apart from requests that left', async ({ page, audit, expectDiagnostic }) => {
  const production = audit.mode === 'production';
  audit.canaries(...CANARIES);
  audit.expectViolations({ subject: new RegExp(`${CONTROL}|^${receiver.origin}`) });
  // Served at the browser's network layer like real Worker traffic: a page route would answer the Worker's first request
  // before that layer, where the audit cannot hold it, and the audit would rightly report the Worker as uncovered.
  audit.serve(new RegExp(`${CONTROL}worker\\.js$`), {
    headers: { 'content-type': 'text/javascript', 'content-security-policy': PREVIEW_CONTENT_SECURITY_POLICY }, body: WORKER_SOURCE,
  });
  audit.serve(new RegExp(`${CONTROL}worker-fetch\\?`), { status: 204, body: '' });
  await routeControls(page);
  await openApp(page);
  audit.phase('controls');
  const outcome = await page.evaluate(async ({ control, markers, receiver }) => {
    const worker = new Worker(`${control}worker.js`, { type: 'module' });
    const result = await new Promise(resolve => {
      worker.onmessage = event => { resolve(event.data); };
      worker.postMessage(receiver);
    });
    worker.terminate();
    let page: string;
    try {
      const response = await fetch(`${receiver}/page?m=${markers.pageBlocked}`, { method: 'POST', body: markers.sent });
      await response.arrayBuffer();
      page = 'sent';
    } catch {
      page = 'blocked';
    }
    return { worker: result, page };
  }, { control: CONTROL, markers: MARKERS, receiver: receiver.origin });
  expect(outcome).toEqual({ worker: [204, 'blocked'], page: production ? 'blocked' : 'sent' });
  if (production) {
    // The strict policy refuses other origins to fetch(); a top-level navigation is outside connect-src and leaves.
    audit.phase('navigation');
    await page.evaluate(url => { location.assign(url); }, `${receiver.origin}/sent?m=${MARKERS.sent}`);
    await page.waitForURL(`${receiver.origin}/sent?*`);
    expectDiagnostic(`console: : Connecting to '${receiver.origin}/page?m=${MARKERS.pageBlocked}' violates the following Content Security Policy directive: "connect-src 'self'". The action has been blocked.`);
    expectDiagnostic(`console: : Fetch API cannot load ${receiver.origin}/page?m=${MARKERS.pageBlocked}. Refused to connect because it violates the document's Content Security Policy.`);
  }

  const report = await audit.report();
  expect(hits(report)).toEqual(expect.arrayContaining([
    { name: 'workerUrl', location: 'url', encoding: 'raw', initiator: 'worker', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'workerHeader', location: 'header', encoding: 'raw', initiator: 'worker', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'workerBody', location: 'body', encoding: 'raw', initiator: 'worker', phase: 'controls', channel: 'request', delivery: 'intercepted' },
    { name: 'workerBlocked', location: 'url', encoding: 'raw', initiator: 'worker', phase: 'controls', channel: 'csp', delivery: 'blocked' },
    production
      ? { name: 'pageBlocked', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'csp', delivery: 'blocked' }
      : { name: 'pageBlocked', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'sent' },
    production
      ? { name: 'sent', location: 'url', encoding: 'raw', initiator: 'page', phase: 'navigation', channel: 'request', delivery: 'sent' }
      : { name: 'sent', location: 'body', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'sent' },
  ]));
  // The page requested the Worker's script; everything the Worker sent itself is the Worker's.
  expect(report.violations.filter(violation => violation.subject.includes('worker-')).map(violation => violation.initiator)).toEqual(expect.arrayContaining(['worker']));
  expect(report.violations.filter(violation => violation.subject.includes('worker-')).every(violation => violation.initiator === 'worker')).toBe(true);
  expect(report.violations).toContainEqual(expect.objectContaining({ category: 'path', initiator: 'page', subject: expect.stringContaining(`${CONTROL}worker.js`), delivery: 'intercepted' }));
  expect(report.violations).toContainEqual(expect.objectContaining({ category: 'csp', initiator: 'worker', delivery: 'blocked', subject: `${receiver.origin}/worker-blocked?m=${MARKERS.workerBlocked}` }));
  expect(receiver.requests.map(({ method, url }) => `${method} ${url}`)).toContain(production ? `GET /sent?m=${MARKERS.sent}` : `POST /page?m=${MARKERS.pageBlocked}`);
  expect(receiver.requests.filter(({ url }) => url.includes('worker-blocked') || (production && url.includes('/page')))).toEqual([]);
  expect(report.gaps).toEqual([]);
});

test('a beacon sent while a page closes is detected in the close phase', async ({ page, audit }) => {
  const production = audit.mode === 'production';
  audit.canaries(...CANARIES);
  audit.expectViolations({ phase: 'close', subject: /\/close-beacon$/ });
  const closing = await page.context().newPage();
  await audit.attachPage(closing);
  await openApp(closing);
  // The strict policy only lets a beacon reach the page's own origin, the local preview server.
  const target = production ? `${CONTROL}close-beacon` : `${receiver.origin}/close-beacon`;
  await closing.evaluate(({ target, marker }) => { addEventListener('pagehide', () => { navigator.sendBeacon(target, marker); }); }, { target, marker: MARKERS.close });
  await audit.close(closing);

  const report = await audit.report();
  expect(hits(report)).toEqual([{ name: 'close', location: 'body', encoding: 'raw', initiator: 'browser', phase: 'close', channel: 'request', delivery: 'sent' }]);
  expect(categories(report, '/close-beacon')).toEqual(['body', 'canary', 'method', production ? 'path' : 'origin']);
  if (!production) expect(receiver.requests).toEqual([{ method: 'POST', url: '/close-beacon', body: MARKERS.close }]);
  expect(report.gaps).toEqual([]);
});

test('a popup is a violation, and its page, which the audit does not observe, leaves the evidence incomplete', async ({ page, audit }) => {
  audit.canaries(...CANARIES);
  audit.expectViolations({ subject: new RegExp(`^${receiver.origin}`) });
  audit.expectGaps({ reason: 'uncovered-target' }, { reason: 'unknown-initiator', subject: new RegExp(`^${receiver.origin}`) });
  await openApp(page);
  audit.phase('controls');
  const popup = page.waitForEvent('popup');
  await page.evaluate(url => { window.open(url); }, `${receiver.origin}/popup?m=${MARKERS.popup}`);
  await (await popup).waitForLoadState();
  expect(receiver.requests.map(({ url }) => url)).toContain(`/popup?m=${MARKERS.popup}`);

  const report = await audit.report();
  expect(report.violations).toContainEqual(expect.objectContaining({ category: 'popup', initiator: 'page', phase: 'controls', subject: `${receiver.origin}/popup?m=${MARKERS.popup}` }));
  expect(hits(report)).toContainEqual({ name: 'popup', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'popup', delivery: undefined });
  expect(report.complete).toBe(false);
  expect(report.gaps).toContainEqual(expect.objectContaining({ reason: 'uncovered-target', subject: `${receiver.origin}/popup?m=${MARKERS.popup}` }));
  expect(report.gaps).toContainEqual(expect.objectContaining({ reason: 'unknown-initiator', subject: `${receiver.origin}/popup?m=${MARKERS.popup}` }));
});

test('service worker registration attempts and the state each version ends in are recorded', async ({ page, audit }) => {
  audit.canaries(...CANARIES);
  audit.expectViolations({ subject: new RegExp(`${CONTROL}sw`) });
  // The browser fetches a service worker's script for no frame, so that request cannot be attributed either.
  audit.expectGaps({ reason: 'uncovered-target', subject: new RegExp(`${CONTROL}sw`) }, { reason: 'unknown-initiator', subject: new RegExp(`${CONTROL}sw`) });
  const script = { 'content-type': 'text/javascript' };
  audit.serve(new RegExp(`${CONTROL}sw\\.js`), { headers: script, body: '// An empty synthetic service worker.\n' });
  audit.serve(new RegExp(`${CONTROL}sw-failing\\.js`), {
    headers: script, body: "self.addEventListener('install', event => { event.waitUntil(Promise.reject(new Error('synthetic install failure'))); });\n",
  });
  await openApp(page);
  audit.phase('controls');
  const states = await page.evaluate(registrations => Promise.all(registrations.map(async ([url, scope]) => {
    const registration = await navigator.serviceWorker.register(url, { scope });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    return new Promise(resolve => {
      const settle = (): void => { if (worker?.state === 'activated' || worker?.state === 'redundant') resolve(worker.state); };
      worker?.addEventListener('statechange', settle);
      settle();
    });
  })), [[`${CONTROL}sw.js?m=${MARKERS.serviceWorker}`, `${CONTROL}a/`], [`${CONTROL}sw-failing.js`, `${CONTROL}b/`]]);
  expect(states).toEqual(['activated', 'redundant']);

  const details = async () => (await audit.report()).violations.filter(violation => violation.category === 'service-worker').map(({ detail }) => detail);
  await expect.poll(details).toEqual(expect.arrayContaining([
    'service worker register: fulfilled', expect.stringMatching(/^service worker version: activated, /), expect.stringMatching(/^service worker version: redundant, /),
    expect.stringMatching(/^service worker target: /),
  ]));
  const report = await audit.report();
  expect(report.violations.filter(({ detail }) => detail === 'service worker register: fulfilled').map(({ initiator, phase }) => ({ initiator, phase })))
    .toEqual([{ initiator: 'page', phase: 'controls' }, { initiator: 'page', phase: 'controls' }]);
  expect(hits(report)).toContainEqual({ name: 'serviceWorker', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'service-worker', delivery: undefined });
  expect(report.gaps).toContainEqual(expect.objectContaining({ reason: 'uncovered-target', subject: expect.stringContaining(`${CONTROL}sw`) }));
  expect(report.complete).toBe(false);
});

test('a page another CDP client created, as in the native-lifecycle browser, is audited the same way up to its closing', async ({ browser, audit, baseURL }) => {
  audit.canaries(...CANARIES);
  audit.expectViolations({ subject: new RegExp(`${CONTROL}native`) });
  audit.serve(new RegExp(`${CONTROL}native`), { status: 204, body: '' });
  const root = await browser.newBrowserCDPSession();
  const { browserContextId } = await root.send('Target.createBrowserContext');
  let target: NativeTarget | undefined;
  try {
    const { targetId } = await root.send('Target.createTarget', { url: 'about:blank', browserContextId });
    await audit.attachTarget(browser, targetId);
    const { sessionId } = await root.send('Target.attachToTarget', { targetId, flatten: false });
    const native = target = new NativeTarget(root, sessionId);
    await native.command('Page.navigate', { url: baseURL });
    await until(() => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''),
      text => text === 'Original game data: None in this browser.', 'Application load');
    audit.phase('controls');
    await native.evaluate(async ({ control, markers }) => {
      await (await fetch(`${control}native?m=${markers.native}`)).arrayBuffer();
      addEventListener('pagehide', () => { navigator.sendBeacon(`${control}native-close`, markers.nativeClose); });
    }, { control: CONTROL, markers: MARKERS });
    await audit.close(targetId);

    const report = await audit.report();
    expect(hits(report)).toEqual([
      { name: 'native', location: 'url', encoding: 'raw', initiator: 'page', phase: 'controls', channel: 'request', delivery: 'intercepted' },
      { name: 'nativeClose', location: 'body', encoding: 'raw', initiator: 'browser', phase: 'close', channel: 'request', delivery: 'intercepted' },
    ]);
    // Its own loads passed the same rules as an ordinary page's.
    expect(report.allowed).toContainEqual(expect.objectContaining({ kind: 'product', channel: 'request', initiator: 'page', subject: `${new URL(baseURL ?? '').origin}/` }));
    expect(report.gaps).toEqual([]);
  } finally {
    target?.dispose();
    await root.send('Target.disposeBrowserContext', { browserContextId });
    await root.detach();
  }
});

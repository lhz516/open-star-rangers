import type { BrowserContext, Page } from '@playwright/test';
import { button } from './support/app-entry.ts';
import { test, expect, collectBrowserErrors, settleDiagnostics } from './support/browser-test.ts';
import {
  devState, endPlaceholder, enterMission, expectAdvancingTick, expectFlightCanvas, expectStableTick, FLIGHT_SURFACE_LISTENERS, frameWindow, missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

test('probe preserves native listener, observer, frame and timer behavior', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const timers = window.osrProbe.snapshot().timers;
    const node = document.createElement('div');
    document.body.append(node);
    let calls = 0;
    let correctThis = false;
    const listener = function (this: EventTarget): void { calls++; correctThis = this === node; };
    node.addEventListener('probe', listener);
    node.addEventListener('probe', listener);
    node.dispatchEvent(new Event('probe'));
    const registered = window.osrProbe.snapshot().listeners.filter(entry => entry.type === 'probe' && entry.active).length;
    node.removeEventListener('probe', listener, true);
    node.dispatchEvent(new Event('probe'));
    node.removeEventListener('probe', listener);
    node.dispatchEvent(new Event('probe'));
    const observer = new ResizeObserver(() => {});
    observer.observe(node);
    const observed = window.osrProbe.snapshot().observers.filter(entry => entry.targets.length).length;
    observer.unobserve(node);
    observer.disconnect();
    const handle = requestAnimationFrame(() => { throw new Error('Cancelled callback was delivered'); });
    cancelAnimationFrame(handle);
    const time = await new Promise<number>(resolve => requestAnimationFrame(resolve));
    let nativeError = false;
    try { EventTarget.prototype.addEventListener.call({}, 'probe', listener); } catch (error) { nativeError = error instanceof TypeError; }
    let onceCalls = 0;
    node.addEventListener('probe-once', () => { onceCalls++; }, { once: true });
    node.dispatchEvent(new Event('probe-once'));
    node.dispatchEvent(new Event('probe-once'));
    node.remove();
    // The test's own timers keep their native behaviour and are not the application's.
    const fired = await new Promise<{ self: boolean; values: unknown[] }>(resolve => {
      setTimeout(function (this: unknown, ...values: unknown[]) { resolve({ self: this === window, values }); }, 1, 'a', 2);
    });
    let cleared = true;
    clearTimeout(setTimeout(() => { cleared = false; }, 0));
    await new Promise(resolve => setTimeout(resolve, 20));
    const after = window.osrProbe.snapshot();
    return { calls, correctThis, registered, observed, nativeError, onceCalls, time, fired, cleared, timers, after };
  });
  expect(result).toMatchObject({ calls: 2, correctThis: true, registered: 1, observed: 1, nativeError: true, onceCalls: 1, fired: { self: true, values: ['a', 2] }, cleared: true });
  expect(result.after.timers).toEqual(result.timers);
  expect(result.time).toBeGreaterThan(0);
  expect(result.after.listeners.filter(entry => entry.type === 'probe' && entry.active)).toEqual([]);
  expect(result.after.listeners.filter(entry => entry.type === 'probe-once' && entry.active)).toEqual([]);
  expect(result.after.observers.every(entry => entry.targets.length === 0)).toBe(true);
  expect(result.after.frames.pending).toBe(0);
  const restored = await page.evaluate(() => {
    const before = window.osrProbe.snapshot().listeners.length;
    window.osrProbe.restore();
    const node = new EventTarget();
    const callback = () => {};
    node.addEventListener('after-restore', callback);
    node.removeEventListener('after-restore', callback);
    return { before, after: window.osrProbe.snapshot().listeners.length, timers: window.setTimeout.toString().includes('[native code]') };
  });
  expect(restored.after).toBe(restored.before);
  expect(restored.timers).toBe(true);
});

const TIMERS = '/assets/osr-probe-timers.js';

test('probe records the application\'s one-shot timers without changing their scheduling, arguments, handles or clearing', async ({ page, context }) => {
  // Served under /assets/, so the probes attribute its timers to the application.
  await context.route(`**${TIMERS}`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: `
export function schedule(delay, ...values) {
  return new Promise(resolve => {
    const handle = setTimeout(function (...received) { resolve({ handle, self: this === window, received }); }, delay, ...values);
  });
}
export function start(delay) { return setTimeout(() => { throw new Error('A cleared timer fired'); }, delay); }
export function stop(handle) { clearTimeout(handle); }
` }));
  await page.goto('/');
  const result = await page.evaluate(async path => {
    const timers = await import(path) as {
      schedule(delay: number, ...values: unknown[]): Promise<{ handle: number; self: boolean; received: unknown[] }>;
      start(delay: number): number; stop(handle: number): void;
    };
    const before = window.osrProbe.snapshot().timers;
    const long = timers.start(60_000);
    const pending = window.osrProbe.snapshot().timers;
    timers.stop(long);
    timers.stop(long);
    const fired = await timers.schedule(1, 'x', 3);
    const after = window.osrProbe.snapshot().timers;
    return { before, long, pending, fired, after };
  }, TIMERS);
  expect(Number.isSafeInteger(result.long) && result.long > 0).toBe(true);
  expect(result.pending.pending).toEqual([...result.before.pending, { id: expect.any(Number), delay: 60_000 }]);
  expect(result.pending.scheduled).toBe(result.before.scheduled + 1);
  expect(result.fired).toMatchObject({ self: true, received: ['x', 3] });
  expect(Number.isSafeInteger(result.fired.handle) && result.fired.handle !== result.long).toBe(true);
  const [{ id: long }] = result.pending.pending.slice(-1);
  expect(result.after).toEqual({
    pending: result.before.pending, scheduled: result.before.scheduled + 2, fired: [...result.before.fired, expect.any(Number)], cleared: [...result.before.cleared, long],
  });
  expect(result.after.fired.at(-1)).toBeGreaterThan(long);
});

/**
 * Serves `source` as a same-origin JavaScript Worker script at `/__probe/<name>.js`, which the production preview's strict
 * policy allows where a Blob URL would not be.
 */
async function serveWorker(context: BrowserContext, name: string, source: string): Promise<string> {
  const path = `/__probe/${name}.js`;
  await context.route(`**${path}`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: source }));
  return path;
}

test('probe records Workers without changing module loading, messaging or termination', async ({ page, context }) => {
  // `import.meta` parses only in a module script, so a reply proves the Worker still loads as a module.
  const url = await serveWorker(context, 'echo', 'const base = import.meta.url; self.onmessage = event => self.postMessage({ doubled: event.data * 2, module: typeof base });');
  await page.goto('/');
  const result = await page.evaluate(async url => {
    const worker = new Worker(url, { type: 'module', name: 'probe-worker' });
    const replied = new Promise<unknown>(resolve => { worker.addEventListener('message', event => resolve(event.data), { once: true }); });
    const listening = window.osrProbe.snapshot().listeners.filter(entry => entry.group === 'worker');
    worker.postMessage(21);
    const reply = await replied;
    worker.terminate();
    worker.terminate();
    const after = window.osrProbe.snapshot();
    return {
      reply, instance: worker instanceof Worker, prototype: Object.getPrototypeOf(worker) === Worker.prototype,
      listening: listening.map(entry => [entry.type, entry.active]),
      records: after.workers.map(({ viteWorker, type, name, posts, terminations }) => ({ viteWorker, type, name, posts, terminations })),
      active: after.listeners.filter(entry => entry.group === 'worker' && entry.active).length,
    };
  }, url);
  expect(result).toEqual({
    reply: { doubled: 42, module: 'string' }, instance: true, prototype: true, listening: [['message', true]],
    records: [{ viteWorker: false, type: 'module', name: 'probe-worker', posts: 1, terminations: 2 }], active: 0,
  });
});

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** Seeds the startable synthetic mission package under the production identity and restores it through the menu. */
async function restoreMission(page: Page): Promise<void> {
  const mission = missionPackage();
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
}

test('reads the mission screen\'s run attributes, development diagnostics and owner resources', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const development = testInfo.project.name === 'development';
  await restoreMission(page);
  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  const departure = await waitForFrame(page, frame => frame.position === 'departure');
  expect(departure).toEqual({ owner, run: 1, tick: 0, position: 'departure' });
  await endPlaceholder(page, 'G-02/2', 'button');
  // Fresh attributes: the same run's tick advances while running and holds while paused.
  const advancing = await expectAdvancingTick(page);
  const resources = await frameWindow(page);
  await button(page, 'Pause').click();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-pause', 'user');
  const stable = await expectStableTick(page);
  expect(stable).toBeGreaterThanOrEqual(advancing.to);
  expect(await missionFrame(page)).toEqual({ owner, run: 1, tick: stable, position: 'flight' });
  // The diagnostics read the same run's snapshot (development builds); production builds have no panel.
  const diagnostics = development ? await devState(page) : null;
  if (diagnostics) expect(diagnostics).toMatchObject({ run: 1, tick: stable, wingman: 0 });
  else expect(await page.locator('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').count()).toBe(0);
  // While running: one frame loop, session and input listeners, one leave guard, a 2D cursor, the flight surface with its
  // listeners and size observer (P3-12), no timer.
  expect(resources.frames.maximum).toBeLessThanOrEqual(1);
  expect(resources.frames.delivered).toBeGreaterThan(0);
  const active = resources.listeners.filter(entry => entry.active);
  expect(active.filter(entry => entry.group === 'session').map(entry => entry.type).sort()).toEqual(['pagehide', 'pageshow', 'visibilitychange']);
  expect(active.filter(entry => entry.group === 'keyboard').map(entry => entry.type).sort())
    .toEqual(['blur', 'focus', 'focusin', 'focusout', 'keydown', 'keyup', 'pagehide', 'pageshow', 'visibilitychange']);
  expect(new Set(active.filter(entry => entry.group === 'keyboard' && ['keydown', 'keyup', 'focusin', 'focusout'].includes(entry.type))
    .map(entry => entry.target)).size).toBe(1);
  expect(active.filter(entry => entry.group === 'fullscreen').map(entry => entry.type).sort()).toEqual(['fullscreenchange', 'fullscreenerror']);
  expect(active.filter(entry => entry.group === 'pointer-lock').map(entry => entry.type).sort())
    .toEqual(['mousedown', 'mousemove', 'mouseup', 'pointerlockchange', 'pointerlockerror']);
  expect(active.filter(entry => entry.group === 'render').map(entry => entry.type).sort()).toEqual(FLIGHT_SURFACE_LISTENERS);
  expect(active.filter(entry => entry.type === 'beforeunload' && entry.group !== 'vite').map(entry => entry.group)).toEqual(['other']);
  expect(active.some(entry => entry.group === 'react')).toBe(true);
  expect(resources.timers.pending).toEqual([]);
  expect(resources.canvases.filter(canvas => canvas.connected)).toEqual([expect.objectContaining({ extension: true, lost: false })]);
  await expectFlightCanvas(page);
  expect(resources.observers.filter(entry => entry.targets.length > 0).map(entry => entry.targets.length)).toEqual([1]);
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  const after = await frameWindow(page);
  expect(after.frames).toMatchObject({ pending: 0, maximum: 0, requested: 0 });
  expect(after.listeners.filter(entry => entry.active && (['keyboard', 'fullscreen', 'pointer-lock', 'session', 'render'].includes(entry.group) || (entry.type === 'beforeunload' && entry.group !== 'vite')))).toEqual([]);
  expect(after.timers.pending).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(after.canvases.filter(canvas => canvas.connected || !canvas.lost)).toEqual([]);
  expect(after.observers.every(entry => entry.targets.length === 0)).toBe(true);
  await testInfo.attach('readonly-observations', {
    body: JSON.stringify({ departure, advancing, stable, diagnostics, resources, after }), contentType: 'application/json',
  });
});

test('error collector retains console, native exception and failed HTTP reasons', async ({ page, context }) => {
  await page.goto('/');
  const child = await context.newPage();
  try {
    const collected = collectBrowserErrors(child);
    await child.goto(page.url());
    await child.evaluate(() => { console.error('controlled-probe-console'); });
    const exception = child.waitForEvent('pageerror');
    await child.evaluate(() => { setTimeout(() => { throw new Error('controlled-probe-exception'); }, 0); });
    await exception;
    await child.evaluate(async () => { await fetch('/controlled-probe-missing.js', { headers: { Accept: 'application/javascript' } }); });
    await expect.poll(() => collected.errors.some(error => error.includes('HTTP 404:') && error.includes('controlled-probe-missing.js'))).toBe(true);
    expect(collected.errors.some(error => error.includes('controlled-probe-console'))).toBe(true);
    expect(collected.errors.some(error => error.includes('controlled-probe-exception'))).toBe(true);
  } finally {
    await child.close();
  }
});

test('error collector retains Worker console errors and settles declared diagnostics exactly', async ({ page, context, expectDiagnostic }) => {
  const url = await serveWorker(context, 'console', "console.error('controlled-worker-console');");
  await page.goto('/');
  const child = await context.newPage();
  try {
    const collected = collectBrowserErrors(child);
    await child.goto(page.url());
    await child.evaluate(url => { new Worker(url, { type: 'module' }); }, url);
    await expect.poll(() => collected.errors.some(error => error.startsWith('worker console: ') && error.endsWith(': controlled-worker-console'))).toBe(true);
  } finally {
    await child.close();
  }
  expect(settleDiagnostics(['a', 'b', 'a'], ['a', 'c'])).toEqual({ matched: ['a'], unexpected: ['b', 'a'], missing: ['c'] });
  expect(settleDiagnostics(['a'], [' a'])).toEqual({ matched: [], unexpected: ['a'], missing: [' a'] });
  // Declared in the collector's wording, this error is allowed and recorded instead of failing the test.
  const logged = page.waitForEvent('console', message => message.text() === 'controlled-declared-diagnostic');
  await page.evaluate(() => { console.error('controlled-declared-diagnostic'); });
  expectDiagnostic(`console: ${(await logged).location().url}: controlled-declared-diagnostic`);
});

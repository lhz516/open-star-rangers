import { test, expect, collectBrowserErrors } from './support/browser-test.ts';
import { diagnostics, enterDemo, frameWindow, stableAxis } from './support/demo-observations.ts';
import { image, verifyLayout } from './support/image-observations.ts';

test('probe preserves native listener, observer and frame behavior', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
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
    const after = window.osrProbe.snapshot();
    return { calls, correctThis, registered, observed, nativeError, onceCalls, time, after };
  });
  expect(result).toMatchObject({ calls: 2, correctThis: true, registered: 1, observed: 1, nativeError: true, onceCalls: 1 });
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
    return { before, after: window.osrProbe.snapshot().listeners.length };
  });
  expect(restored.after).toBe(restored.before);
});

test('probe records Workers without changing module loading, messaging or termination', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // `import.meta` parses only in a module script, so a reply proves the Worker still loads as a module.
    const source = 'const base = import.meta.url; self.onmessage = event => self.postMessage({ doubled: event.data * 2, module: typeof base });';
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url, { type: 'module', name: 'probe-worker' });
    const replied = new Promise<unknown>(resolve => { worker.addEventListener('message', event => resolve(event.data), { once: true }); });
    const listening = window.osrProbe.snapshot().listeners.filter(entry => entry.group === 'worker');
    worker.postMessage(21);
    const reply = await replied;
    worker.terminate();
    worker.terminate();
    URL.revokeObjectURL(url);
    const after = window.osrProbe.snapshot();
    return {
      reply, instance: worker instanceof Worker, prototype: Object.getPrototypeOf(worker) === Worker.prototype,
      listening: listening.map(entry => [entry.type, entry.active]),
      records: after.workers.map(({ viteWorker, type, name, posts, terminations }) => ({ viteWorker, type, name, posts, terminations })),
      active: after.listeners.filter(entry => entry.group === 'worker' && entry.active).length,
    };
  });
  expect(result).toEqual({
    reply: { doubled: 42, module: 'string' }, instance: true, prototype: true, listening: [['message', true]],
    records: [{ viteWorker: false, type: 'module', name: 'probe-worker', posts: 1, terminations: 2 }], active: 0,
  });
});

test('reads real pixels, fresh projections, layout and owner resources', async ({ page }, testInfo) => {
  await page.goto('/');
  await enterDemo(page);
  await expect(page.getByTestId('render-status')).toHaveAttribute('data-state', 'ready');
  const pixels = await image(page);
  expect(pixels.mover.count).toBeGreaterThanOrEqual(9);
  expect(pixels.marker.count).toBe(0);
  const layout = await verifyLayout(page);
  const samples = await stableAxis(page);
  const read = await diagnostics(page);
  expect(read.state).toBe('ready');
  expect(read.entities).toBe(1);
  const resources = await frameWindow(page);
  expect(resources.frames.maximum).toBeLessThanOrEqual(1);
  expect(resources.frames.delivered).toBeGreaterThan(0);
  expect(resources.listeners.filter(entry => entry.active && entry.group === 'keyboard')).toHaveLength(9);
  expect(resources.listeners.filter(entry => entry.active && entry.group === 'session')).toHaveLength(3);
  expect(resources.listeners.filter(entry => entry.active && entry.group === 'keyboard').map(entry => entry.type).sort())
    .toEqual(['blur', 'focus', 'focusin', 'focusout', 'keydown', 'keyup', 'pagehide', 'pageshow', 'visibilitychange']);
  expect(resources.listeners.filter(entry => entry.active && entry.group === 'session').map(entry => entry.type).sort())
    .toEqual(['pagehide', 'pageshow', 'visibilitychange']);
  expect(resources.listeners.some(entry => entry.active && entry.group === 'react')).toBe(true);
  expect(resources.canvases).toHaveLength(1);
  expect(resources.canvases[0]).toMatchObject({ connected: true, lost: false });
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  const after = await frameWindow(page);
  expect(after.frames.pending).toBe(0);
  expect(after.listeners.filter(entry => entry.active && ['keyboard', 'session', 'render'].includes(entry.group))).toEqual([]);
  expect(after.observers.every(entry => entry.targets.length === 0)).toBe(true);
  expect(after.canvases.every(canvas => !canvas.connected && (!canvas.extension || canvas.lost))).toBe(true);
  await testInfo.attach('readonly-observations', {
    body: JSON.stringify({ pixels, layout, samples, resources, after }), contentType: 'application/json',
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

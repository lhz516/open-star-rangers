import { test, expect } from '@playwright/test';
import { installBrowserProbes } from './support/browser-probes.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';

declare global {
  interface Window {
    osrNativeVisibility: string[];
    osrNativeKeys: { code: string; repeat: boolean; trusted: boolean }[];
  }
}

function installNativeObservations(): void {
  window.osrNativeVisibility = [document.visibilityState];
  window.osrNativeKeys = [];
  document.addEventListener('visibilitychange', () => { window.osrNativeVisibility.push(document.visibilityState); });
  document.addEventListener('keydown', event => { window.osrNativeKeys.push({ code: event.code, repeat: event.repeat, trusted: event.isTrusted }); }, true);
}

function state() {
  const text = (name: string) => document.querySelector(`[data-testid="${name}"]`)?.textContent ?? '';
  return {
    visibility: document.visibilityState, phase: text('phase'), reason: text('pause-reason'),
    renderState: document.querySelector('[data-testid="render-status"]')?.getAttribute('data-state') ?? '',
    tick: Number(text('tick')), x: / at \(([-\d.]+),/.exec(text('mover'))?.[1] ?? '',
    visibilityEvents: window.osrNativeVisibility, keys: window.osrNativeKeys,
    errors: ['action-error', 'session-error', 'cleanup-failure', 'open-demo-failure'].filter(name => document.querySelector(`[data-testid="${name}"]`)),
  };
}

test('native tab visibility pauses and stays paused until trusted explicit resume', async ({ baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Native lifecycle requires a development origin');
  const browser = await nativeBrowser();
  let contextId: string | undefined;
  let target: NativeTarget | undefined;
  let root: Awaited<ReturnType<typeof browser.newBrowserCDPSession>> | undefined;
  try {
    root = await browser.newBrowserCDPSession();
    contextId = (await root.send('Target.createBrowserContext')).browserContextId;
    const appId = (await root.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const alternateId = (await root.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const session = await root.send('Target.attachToTarget', { targetId: appId, flatten: false });
    target = new NativeTarget(root, session.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await target.command(`${domain}.enable`);
    await target.command('Page.addScriptToEvaluateOnNewDocument', { source: `(${installBrowserProbes.toString()})();(${installNativeObservations.toString()})();` });
    await target.command('Page.navigate', { url: baseURL });
    await root.send('Target.activateTarget', { targetId: appId });
    const app = target;
    await until(() => app.evaluate(() => document.querySelector('#main-menu-heading')?.textContent), value => value === 'Main menu', 'Application load');
    await expect(app.command('OSRControlledMissing.method')).rejects.toThrow('wasn\'t found');
    await expect(app.evaluate(() => { throw new Error('controlled-evaluate-exception'); })).rejects.toThrow('controlled-evaluate-exception');
    await app.click('button[aria-describedby="demo-entry-description"]');
    await until(() => app.evaluate(state), value => value.phase === 'running' && value.tick > 0 && value.renderState === 'ready', 'Visible running session with WebGL 2');
    await app.click('[data-testid="synthetic-view"]');
    await app.key('ArrowRight', 'keyDown');
    const moving = await until(() => app.evaluate(state), value => Number(value.x) > 0.15, 'Trusted initial movement');
    await root.send('Target.activateTarget', { targetId: alternateId });
    const hidden = await until(() => app.evaluate(state), value => value.visibility === 'hidden' && value.phase === 'paused' && value.reason === 'hidden', 'Actual native hidden and pause');
    await new Promise(resolve => setTimeout(resolve, 400));
    const hiddenStable = await app.evaluate(state);
    expect(hiddenStable.tick).toBe(hidden.tick);
    await root.send('Target.activateTarget', { targetId: appId });
    await until(() => app.evaluate(state), value => value.visibility === 'visible', 'Actual native visible return');
    await app.evaluate(async () => {
      for (let index = 0; index < 3; index++) await new Promise(resolve => requestAnimationFrame(resolve));
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    const visiblePaused = await app.evaluate(state);
    expect(visiblePaused.phase).toBe('paused');
    expect(visiblePaused.tick).toBe(hidden.tick);
    await app.click('[data-testid="synthetic-view"]');
    await app.key('KeyP', 'keyDown');
    await app.key('KeyP', 'keyUp');
    await app.key('ArrowRight', 'keyDown', true);
    const resumed = await until(() => app.evaluate(state), value => value.phase === 'running' && value.tick > visiblePaused.tick, 'Explicit trusted P resume');
    const samples = [{ ...resumed, time: Date.now() }];
    for (let index = 0; index < 3; index++) {
      await new Promise(resolve => setTimeout(resolve, 120));
      samples.push({ ...await app.evaluate(state), time: Date.now() });
    }
    expect(samples.at(-1)!.time - samples[0].time).toBeGreaterThanOrEqual(300);
    expect(samples.at(-1)!.tick).toBeGreaterThan(samples[0].tick);
    expect(new Set(samples.map(sample => sample.x)).size).toBe(1);
    await app.key('ArrowRight', 'keyUp');
    await app.key('ArrowRight', 'keyDown');
    const fresh = await until(() => app.evaluate(state), value => Number(value.x) > Number(resumed.x) + 0.15, 'Fresh trusted press movement');
    await app.key('ArrowRight', 'keyUp');
    expect(fresh.keys.every(key => key.trusted)).toBe(true);
    expect(fresh.keys.some(key => key.code === 'ArrowRight' && key.repeat)).toBe(true);
    expect(fresh.visibilityEvents).toContain('hidden');
    expect(fresh.visibilityEvents.at(-1)).toBe('visible');
    expect(fresh.errors).toEqual([]);
    await app.click('#demo-heading + p button');
    const released = await app.evaluate(() => window.osrProbe.snapshot());
    expect(released.frames.pending).toBe(0);
    expect(released.listeners.filter(entry => entry.active && ['keyboard', 'session', 'render'].includes(entry.group))).toEqual([]);
    expect((await app.evaluate(state)).errors).toEqual([]);
    await app.evaluate(() => { window.osrProbe.restore(); });
    expect(app.errors, 'Native application errors').toEqual([]);
    console.info(`Native ${browser.version()}: ${fresh.visibilityEvents.join(' -> ')}, paused tick ${hidden.tick}, repeat stable ${samples[0].x}, fresh x ${fresh.x}`);
    await testInfo.attach('native-lifecycle', {
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, moving, hidden, hiddenStable, visiblePaused, samples, fresh, released, allowed: app.allowed }),
      contentType: 'application/json',
    });
  } finally {
    try {
      await testInfo.attach('native-errors', {
        body: JSON.stringify({ errors: target?.errors ?? [], allowed: target?.allowed ?? [] }), contentType: 'application/json',
      });
    } finally {
      target?.dispose();
      try {
        if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
      } finally {
        await browser.close();
      }
    }
  }
});

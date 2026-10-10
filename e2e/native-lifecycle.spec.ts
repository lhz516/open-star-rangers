import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { installBrowserProbes } from './support/browser-probes.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';

// P3-04 subtask 11 (docs/plan/p3/04/spec.md: 会话, 衔接占位; AC-13): real page hiding of a mission run. The development
// test entry imports the synthetic `mission-startable` package through the real import Worker; the run is started and
// driven only by trusted CDP clicks on the page's own controls. Hiding is native: a headed Chrome with two tabs of a
// CDP-created context, switched with `Target.activateTarget` (docs/engineering/README.md, 已验证的 CDP 自动化路线).
// Evidence comes from the mission screen's read-only attributes and the browser probes; nothing fakes visibility.

declare global {
  interface Window {
    osrNativeVisibility: string[];
    osrResume?: { click: number | null; frame: number | null; ticks: { tick: number; time: number }[]; observer: MutationObserver };
  }
}

function installNativeObservations(): void {
  window.osrNativeVisibility = [document.visibilityState];
  document.addEventListener('visibilitychange', () => { window.osrNativeVisibility.push(document.visibilityState); });
}

/** In the page: the mission screen, its status bar and placeholder, and the owner's resources by the probes. */
function state() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  const probe = window.osrProbe.snapshot();
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null, owner: number(screen?.dataset.owner), run: number(screen?.dataset.run), tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null, pause: status?.dataset.pause ?? null,
    placeholder: document.querySelector<HTMLElement>('[data-testid="mission-placeholder"]')?.dataset.status ?? null,
    frames: probe.frames.pending, timers: probe.timers.pending.length,
    leaveGuards: probe.listeners.filter(entry => entry.active && entry.type === 'beforeunload' && entry.group === 'other').length,
    owned: probe.listeners.filter(entry => entry.active && ['keyboard', 'session', 'render'].includes(entry.group)).map(entry => `${entry.group}:${entry.type}`).sort(),
    visibilityEvents: window.osrNativeVisibility,
    errors: ['cleanup-failure', 'open-mission-failure', 'mission-open-failure', 'mission-action-error', 'mission-placeholder-failure', 'mission-start-failure']
      .filter(name => document.querySelector(`[data-testid="${name}"]`)),
  };
}

/**
 * Before a resume click: records, by the page's clock, the next trusted click, the timestamp of the animation frame
 * requested from that click (the session requests its first frame in the same click, so both arrive in that frame)
 * and every tick the mission screen shows afterwards.
 */
function watchResume(): void {
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) throw new Error('No mission screen to watch');
  const record: NonNullable<Window['osrResume']> = {
    click: null, frame: null, ticks: [],
    observer: new MutationObserver(() => { record.ticks.push({ tick: Number(screen.getAttribute('data-tick')), time: performance.now() }); }),
  };
  window.osrResume = record;
  document.addEventListener('click', () => {
    record.click = performance.now();
    requestAnimationFrame(time => { record.frame = time; });
  }, { capture: true, once: true });
  record.observer.observe(screen, { attributes: true, attributeFilter: ['data-tick'] });
}

/** Ends `watchResume` and returns what it recorded. */
function stopWatchingResume() {
  const record = window.osrResume;
  if (!record) throw new Error('watchResume was not installed');
  record.observer.disconnect();
  delete window.osrResume;
  return { click: record.click, frame: record.frame, ticks: record.ticks };
}

/** The session's lifecycle listeners, which the mission owner holds from its creation to its release. */
const SESSION = ['session:pagehide', 'session:pageshow', 'session:visibilitychange'];
/** One tick of the formal Runtime's default step, 64 ÷ 2 = 32 Hz. */
const TICK_MS = 1000 / 32;

test('native tab hiding pauses the run, which stays paused when visible until an explicit resume that does not catch up', async ({ baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Native lifecycle requires a development origin');
  test.setTimeout(120_000);
  const directory = testInfo.outputPath('disc');
  await mkdir(directory, { recursive: true });
  const paths = await Promise.all((await scenarioFiles('mission-startable')).map(async file => {
    const path = join(directory, file.name);
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  }));
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
    await target.command('Page.navigate', { url: new URL('/e2e/entries/app.html?worker=mission-startable', baseURL).href });
    const cdp = root;
    const show = async (targetId: string) => { await cdp.send('Target.activateTarget', { targetId }); };
    await show(appId);
    const app = target;
    const read = () => app.evaluate(state);
    const settle = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
    /** Lets the visible page run three real animation frames, then 400 ms more. */
    const frames = async () => {
      await app.evaluate(async () => {
        for (let index = 0; index < 3; index++) await new Promise(resolve => requestAnimationFrame(resolve));
      });
      await settle(400);
    };
    await until(() => app.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''),
      text => text === 'Original game data: None in this browser.', 'Application load');
    await expect(app.command('OSRControlledMissing.method')).rejects.toThrow('wasn\'t found');
    await expect(app.evaluate(() => { throw new Error('controlled-evaluate-exception'); })).rejects.toThrow('controlled-evaluate-exception');

    // The synthetic mission package through the test entry's import page and the real module Worker.
    await app.press('Import original game data');
    await until(() => app.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
    await app.setInputFiles('#import-files', paths);
    await app.press('Start import');
    // Clicks land where the button was measured, so each page must have settled: here, the package converted and saved.
    await until(() => app.evaluate(() => document.querySelector('[data-testid="import-statuses"]')?.textContent ?? ''),
      text => text.includes('Mission loads into Core') && text.includes('Saved in this browser'), 'Import and save of the mission package', 60_000);
    await app.press('Return to menu');
    await until(() => app.evaluate(() => ({
      eligibility: document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility'),
      statuses: document.querySelector('[data-testid="resource-statuses"]')?.textContent ?? '',
    })), menu => menu.eligibility === 'eligible' && menu.statuses.includes('Saved in this browser'), 'Startable and saved mission package');

    // Hidden during the departure hold: its timer is revoked while hidden, and ending it on return leaves the run paused.
    await app.press('Start mission');
    const intro = await until(read, value => value.position === 'intro' && value.timers === 1, 'Introduction placeholder');
    expect(intro).toMatchObject({ run: null, tick: null, frames: 0, leaveGuards: 0, owned: SESSION });
    await app.press('Skip');
    await until(read, value => value.position === 'config', 'Start page');
    await app.press('Start');
    const departure = await until(read, value => value.position === 'departure' && value.placeholder === 'timing', 'Departure placeholder');
    expect(departure).toMatchObject({ owner: intro.owner, run: 1, tick: 0, frames: 0, timers: 1, leaveGuards: 1 });
    await show(alternateId);
    const heldHidden = await until(read, value => value.visibility === 'hidden' && value.placeholder === 'waiting', 'Native hidden during the departure');
    await settle(400);
    expect(await read()).toMatchObject({ position: 'departure', run: 1, tick: 0, placeholder: 'waiting', frames: 0, timers: 0 });
    await show(appId);
    await until(read, value => value.visibility === 'visible' && value.placeholder === 'timing', 'Native visible during the departure');
    await app.press('Skip');
    const departed = await until(read, value => value.position === 'flight', 'Departure end');
    expect(departed).toMatchObject({ run: 1, tick: 0, phase: 'paused', pause: 'hidden', frames: 0, timers: 0, leaveGuards: 1 });
    await frames();
    const heldPaused = await read();
    expect(heldPaused).toMatchObject({ position: 'flight', run: 1, tick: 0, phase: 'paused', pause: 'hidden', frames: 0 });
    await app.press('Resume');
    const running = await until(read, value => value.phase === 'running' && value.tick !== null && value.tick > 0, 'Explicit resume after the departure');

    // Hidden in flight: the run pauses and its frame loop stops; visible again it stays paused until resumed.
    await settle(300);
    await show(alternateId);
    const hidden = await until(read, value => value.visibility === 'hidden' && value.phase === 'paused' && value.pause === 'hidden', 'Native hidden and pause');
    expect(hidden).toMatchObject({ run: 1, frames: 0, timers: 0, leaveGuards: 1 });
    await settle(400);
    const hiddenStable = await read();
    expect(hiddenStable.tick).toBe(hidden.tick);
    await show(appId);
    await until(read, value => value.visibility === 'visible', 'Native visible return');
    await frames();
    const visiblePaused = await read();
    expect(visiblePaused).toMatchObject({ phase: 'paused', pause: 'hidden', tick: hidden.tick, frames: 0 });

    // The resume's first frame only anchors, so each tick shown afterwards is within the time since that frame; catching
    // up the time spent hidden would add up to 5 ticks (the per-frame cap) at once.
    await app.evaluate(watchResume);
    await app.press('Resume');
    const resumed = await until(read, value => value.phase === 'running' && value.tick! > visiblePaused.tick!, 'Explicit resume');
    const timing = await app.evaluate(stopWatchingResume);
    if (timing.click === null || timing.frame === null) throw new Error(`The resume click or its frame was not recorded: ${JSON.stringify(timing)}`);
    const shown = timing.ticks.filter(({ tick }) => tick > visiblePaused.tick!);
    expect(shown.length, 'ticks shown after the resume').toBeGreaterThan(0);
    for (const { tick, time } of shown) {
      expect(tick - visiblePaused.tick!, `ticks shown ${(time - timing.frame).toFixed(1)} ms after the resume's first frame`)
        .toBeLessThanOrEqual(Math.floor((time - timing.frame) / TICK_MS) + 1);
    }
    const samples = [{ ...resumed, time: Date.now() }];
    for (let index = 0; index < 3; index++) {
      await settle(120);
      samples.push({ ...await read(), time: Date.now() });
    }
    expect(samples.at(-1)!.time - samples[0].time).toBeGreaterThanOrEqual(300);
    expect(samples.at(-1)!.tick).toBeGreaterThan(samples[0].tick!);
    expect(samples.every(sample => sample.phase === 'running' && sample.run === 1)).toBe(true);
    // The log starts with the state at installation, before the tab was first shown; then two native hide-show pairs.
    expect(resumed.visibilityEvents.slice(-4)).toEqual(['hidden', 'visible', 'hidden', 'visible']);
    expect(resumed.errors).toEqual([]);

    // Leaving the mission releases the owner's session listeners, leave guard, timers and frames.
    await app.press('Mission menu');
    await until(() => app.evaluate(() => document.querySelector('[data-testid="mission-menu"]') !== null), Boolean, 'Mission menu');
    await app.press('Return to main menu');
    const released = await until(read, value => value.position === null && value.frames === 0, 'Main menu');
    expect(released).toMatchObject({ timers: 0, leaveGuards: 0, owned: [], errors: [] });
    await app.evaluate(() => { window.osrProbe.restore(); });
    expect(app.errors, 'Native application errors').toEqual([]);
    const [first] = shown;
    console.info(`Native ${browser.version()}: ${resumed.visibilityEvents.join(' -> ')}; departure held at tick 0; paused tick ${hidden.tick}; `
      + `first shown ${first.tick - visiblePaused.tick!} ticks ${(first.time - timing.frame).toFixed(1)} ms after the resume's first frame `
      + `(${(timing.frame - timing.click).toFixed(1)} ms after the click)`);
    await testInfo.attach('native-lifecycle', {
      body: JSON.stringify({
        browser: browser.version(), origin: baseURL, intro, departure, heldHidden, departed, heldPaused, running, hidden, hiddenStable, visiblePaused,
        resumed, timing, samples, released, allowed: app.allowed,
      }),
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

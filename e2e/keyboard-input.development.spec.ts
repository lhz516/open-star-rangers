import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './support/browser-test.ts';
import { button } from './support/app-entry.ts';
import { scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { missionFrame, waitForFrame } from './support/mission-observations.ts';
import {
  dispatchKeyboardEvent, exportedTickInputs, keyboardEvents, openKeyboardMenu, readExportedTickInputs, startKeyboardFlight, tabTo, waitForTickAfter, watchKeyboardEvents,
} from './support/keyboard-input.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';

test.describe.configure({ timeout: 90_000 });

async function openFlight(page: Parameters<typeof openKeyboardMenu>[0], options: Parameters<typeof openKeyboardMenu>[2] = {}): Promise<void> {
  await openKeyboardMenu(page, 'development', options);
  await startKeyboardFlight(page);
}

function installNativeVisibilityObserver(): void {
  window.osrVisibilityEvents = [document.visibilityState];
  document.addEventListener('visibilitychange', () => {
    window.osrVisibilityEvents!.push(document.visibilityState);
  });
}

function nativeMissionState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => value === undefined || value === '' ? null : Number(value);
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null,
    run: number(screen?.dataset.run),
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    pause: status?.dataset.pause ?? null,
    visibilityEvents: [...(window.osrVisibilityEvents ?? [])],
  };
}

async function nativeKey(target: NativeTarget, type: 'keyDown' | 'keyUp', code: string, key: string, windowsVirtualKeyCode: number): Promise<void> {
  await target.command('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode });
}

test('records opposing axes, Ctrl roll, simultaneous Shift and Alt fire, Space fire and the front-view command per tick', async ({ page }, testInfo) => {
  await openFlight(page, { fullscreen: 'unsupported', keyboardLock: 'unsupported', platform: 'mac' });
  await watchKeyboardEvents(page);
  const zone = page.getByTestId('game-input-zone');
  let tick = Number(await page.getByTestId('mission-screen').getAttribute('data-tick'));

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'BracketRight', key: ']' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Semicolon', key: ';' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'BracketRight', key: ']' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'Semicolon', key: ';' })).toBe(true);
  tick = await waitForTickAfter(page, tick);

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Quote', key: "'", ctrlKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'Quote', key: "'", ctrlKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'AltLeft', key: 'Alt', altKey: true })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'BracketRight', key: ']', shiftKey: true, altKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'AltLeft', key: 'Alt', shiftKey: true })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'BracketRight', key: ']', shiftKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Space', key: ' ' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'Space', key: ' ' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'ArrowUp', key: 'ArrowUp' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'ArrowUp', key: 'ArrowUp' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'F1', key: 'F1' })).toBe(true);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'F1', key: 'F1' })).toBe(true);
  tick = await waitForTickAfter(page, tick);

  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'AltLeft', key: 'Alt', altKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'AltRight', key: 'Alt', altKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'AltLeft', key: 'Alt', altKey: true })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  expect(await dispatchKeyboardEvent(page, { type: 'keyup', code: 'AltRight', key: 'Alt' })).toBe(true);
  await waitForTickAfter(page, tick);

  await expect(zone).toBeFocused();
  const ticks = await exportedTickInputs(page, testInfo.outputPath('keyboard-input.json'));
  expect(ticks.some(({ axes }) => axes.pitch === -1), 'negative pitch was recorded').toBe(true);
  expect(ticks.some(({ axes }) => axes.pitch === 1), 'positive pitch was recorded').toBe(true);
  expect(ticks.some(({ axes }) => axes.pitch === 0), 'opposite pitch keys cancelled').toBe(true);
  expect(ticks.some(({ axes }) => axes.roll === 1), 'Ctrl routed the lateral key to roll').toBe(true);
  expect(ticks.some(({ axes }) => axes.roll === 0), 'roll returned to neutral on keyup').toBe(true);
  const commands = ticks.flatMap(({ commands: recorded }) => recorded);
  expect(commands).toContainEqual({ type: 'fire', channel: 'primary' });
  expect(commands).toContainEqual({ type: 'fire', channel: 'secondary' });
  expect(commands.filter(({ type }) => type === 'cockpit-front')).toHaveLength(2);
  expect((await keyboardEvents(page)).filter(({ code }) => code === 'AltLeft' || code === 'AltRight').slice(-4))
    .toEqual([
      expect.objectContaining({ type: 'keydown', code: 'AltLeft', altKey: true, defaultPrevented: true }),
      expect.objectContaining({ type: 'keydown', code: 'AltRight', altKey: true, defaultPrevented: true }),
      expect.objectContaining({ type: 'keyup', code: 'AltLeft', altKey: true, defaultPrevented: true }),
      expect.objectContaining({ type: 'keyup', code: 'AltRight', altKey: false, defaultPrevented: true }),
    ]);
  await expect(page.getByTestId('dev-results').locator('li').filter({ hasText: 'cockpit-front' }).last())
    .toHaveAttribute('data-outcome', 'rejected');
  await expect(page.getByTestId('dev-results').locator('li').filter({ hasText: 'cockpit-front' }).last())
    .toHaveAttribute('data-reason', 'not-implemented');
  await expect(page.getByTestId('input-status')).toContainText('Keyboard Lock is unavailable');
});

test('a real focusout clears held input and resume does not revive it without a new press', async ({ page }, testInfo) => {
  await openFlight(page, { fullscreen: 'unsupported', keyboardLock: 'unsupported', platform: 'mac' });
  let tick = Number(await page.getByTestId('mission-screen').getAttribute('data-tick'));
  expect(await dispatchKeyboardEvent(page, { type: 'keydown', code: 'Backquote', key: '`' })).toBe(true);
  tick = await waitForTickAfter(page, tick);
  await tabTo(page, button(page, 'Pause'));
  await page.keyboard.press('Space');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  const paused = Number(await page.getByTestId('mission-screen').getAttribute('data-tick'));
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  tick = await waitForTickAfter(page, Math.max(tick, paused));
  await waitForTickAfter(page, tick);

  const ticks = await exportedTickInputs(page, testInfo.outputPath('keyboard-focus-loss.json'));
  const negativeYaw = ticks.flatMap((input, index) => input.axes.yaw === -1 ? [index] : []);
  expect(negativeYaw.length, 'the held key reached the recording').toBeGreaterThan(0);
  expect(negativeYaw.at(-1), 'the last yaw input is not the final recorded tick').toBeLessThan(ticks.length - 1);
  expect(ticks.slice(negativeYaw.at(-1)! + 1).every(input => input.axes.yaw === 0), 'focusout left the later samples neutral').toBe(true);
});

test('the queue-full error is visible, leaves focus in the game zone and does not pause the run', async ({ page }) => {
  await openFlight(page, { fullscreen: 'unsupported', keyboardLock: 'unsupported', platform: 'mac' });
  await page.evaluate(() => {
    const zone = document.activeElement;
    if (!(zone instanceof HTMLElement)) throw new Error('The game input zone is not focused');
    for (let index = 0; index < 257; index += 1) {
      for (const type of ['keydown', 'keyup']) {
        zone.dispatchEvent(new KeyboardEvent(type, { code: 'KeyR', key: 'r', bubbles: true, cancelable: true }));
      }
    }
  });
  await expect(page.getByTestId('dev-action-error')).toContainText('command-queue-full');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
});

test('fullscreen pending is announced while the run can continue', async ({ page }) => {
  await openFlight(page, { fullscreen: 'pending', keyboardLock: 'pending', platform: 'mac' });
  await expect(page.getByTestId('input-status')).toContainText('Requesting full screen');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await tabTo(page, button(page, 'Pause'));
  await page.keyboard.press('Space');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
});

test('fullscreen failure is announced and does not prevent a run from starting', async ({ page }) => {
  await openFlight(page, { fullscreen: 'failed', keyboardLock: 'failed', platform: 'mac' });
  await expect(page.getByTestId('input-status')).toContainText('Full screen failed: failed');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
});

test('a Keyboard Lock failure is distinguished from a successful fullscreen and the run continues', async ({ page }) => {
  await openFlight(page, { keyboardLock: 'failed', platform: 'mac' });
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.getByTestId('input-status')).toContainText('Keyboard Lock failed: failed');
  await expect(page.getByTestId('input-status')).not.toContainText('Full screen failed');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
});

test('a pending Keyboard Lock does not block flight, pause or resume', async ({ page }) => {
  await openFlight(page, { keyboardLock: 'pending', platform: 'mac' });
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await tabTo(page, button(page, 'Pause'));
  await page.keyboard.press('Space');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
});

test('a real hidden then visible transition clears held input and stays paused until explicit resume', async ({ baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Native visibility requires a development origin');
  const directory = testInfo.outputPath('native-keyboard');
  const downloads = join(directory, 'downloads');
  await mkdir(downloads, { recursive: true });
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
    const backgroundId = (await root.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const attached = await root.send('Target.attachToTarget', { targetId: appId, flatten: false });
    target = new NativeTarget(root, attached.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await target.command(`${domain}.enable`);
    await target.command('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installNativeVisibilityObserver.toString()})();`,
    });
    const url = new URL('/e2e/entries/app.html?worker=mission-startable&fullscreen=unsupported&keyboardLock=unsupported&platform=mac', baseURL);
    await target.command('Page.navigate', { url: url.href });
    await root.send('Target.activateTarget', { targetId: appId });
    const app = target;
    await until(
      () => app.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''),
      text => text === 'Original game data: None in this browser.',
      'Application load',
    );
    await root.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, browserContextId: contextId });
    await app.press('Import original game data');
    await until(() => app.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
    await app.setInputFiles('#import-files', paths);
    await app.press('Start import');
    await until(
      () => app.evaluate(() => document.querySelector('[data-testid="import-statuses"]')?.textContent ?? ''),
      text => text.includes('Mission loads into Core') && text.includes('Saved in this browser'),
      'Synthetic mission import',
      60_000,
    );
    await app.press('Return to menu');
    await until(
      () => app.evaluate(() => document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility')),
      eligibility => eligibility === 'eligible',
      'Startable mission',
    );
    await app.press('Start mission');
    await until(() => app.evaluate(nativeMissionState), state => state.position === 'intro', 'Introduction placeholder');
    await app.press('Skip');
    await until(() => app.evaluate(nativeMissionState), state => state.position === 'config', 'Mission start page');
    await app.press('Start');
    await until(() => app.evaluate(nativeMissionState), state => state.position === 'departure', 'Departure placeholder');
    await app.press('Skip');
    let state = await until(
      () => app.evaluate(nativeMissionState),
      current => current.position === 'flight' && current.phase === 'running' && current.tick !== null && current.tick > 0,
      'Running flight',
    );

    await nativeKey(app, 'keyDown', 'Backquote', '`', 192);
    state = await until(
      () => app.evaluate(nativeMissionState),
      current => current.tick !== null && current.tick > state.tick!,
      'Tick after held yaw input',
    );
    await root.send('Target.activateTarget', { targetId: backgroundId });
    state = await until(
      () => app.evaluate(nativeMissionState),
      current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden',
      'Native hidden and automatic pause',
    );
    expect(state.visibilityEvents).toContain('hidden');
    const pausedTick = state.tick;
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(await app.evaluate(nativeMissionState)).toMatchObject({ phase: 'paused', pause: 'hidden', tick: pausedTick });

    await root.send('Target.activateTarget', { targetId: appId });
    state = await until(
      () => app.evaluate(nativeMissionState),
      current => current.visibility === 'visible' && current.phase === 'paused',
      'Native visible return',
    );
    expect(state.visibilityEvents).toContain('visible');
    expect(state.tick).toBe(pausedTick);
    await nativeKey(app, 'keyDown', 'KeyP', 'p', 80);
    await nativeKey(app, 'keyUp', 'KeyP', 'p', 80);
    state = await until(
      () => app.evaluate(nativeMissionState),
      current => current.phase === 'running' && current.tick !== null && current.tick > pausedTick!,
      'Explicit resume by p',
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    await nativeKey(app, 'keyUp', 'Backquote', '`', 192);

    await app.press('Export recording');
    const files = await until(
      async () => (await readdir(downloads)).filter(file => file.endsWith('.json')),
      names => names.length > 0,
      'Recording export',
      15_000,
    );
    const [recording] = files;
    if (!recording) throw new Error('The exported keyboard recording was not saved');
    const ticks = await readExportedTickInputs(join(downloads, recording));
    const negativeYaw = ticks.flatMap((input, index) => input.axes.yaw === -1 ? [index] : []);
    expect(negativeYaw.length, 'the held key reached the recording').toBeGreaterThan(0);
    expect(negativeYaw.at(-1), 'hidden cleared the held key').toBeLessThan(ticks.length - 1);
    expect(ticks.slice(negativeYaw.at(-1)! + 1).every(input => input.axes.yaw === 0), 'the key stayed cleared after visibility returned').toBe(true);
    expect(ticks.length, 'the recording includes explicit post-resume samples').toBeGreaterThan(negativeYaw.at(-1)! + 1);
    expect(app.errors, 'Native application errors').toEqual([]);
  } finally {
    target?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
});

test('starting while another fullscreen is active does not claim or exit it', async ({ page }) => {
  await openKeyboardMenu(page, 'development', { keyboardLock: 'unsupported', platform: 'mac' });
  await page.evaluate(() => {
    const control = document.createElement('button');
    control.textContent = 'Enter test fullscreen';
    control.addEventListener('click', () => { void document.documentElement.requestFullscreen(); });
    document.body.append(control);
  });
  await button(page, 'Enter test fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await startKeyboardFlight(page);
  await tabTo(page, button(page, 'Mission menu'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  await button(page, 'Return to main menu').focus();
  await page.keyboard.press('Enter');
  await expect(missionFrame(page)).resolves.toBeNull();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});

for (const family of ['windows', 'linux', 'other', 'mac'] as const) {
  test(`${family} ${family === 'mac' ? 'does not show' : 'shows'} the non-fullscreen Alt+F4 notice once`, async ({ page }) => {
    await openFlight(page, { fullscreen: 'unsupported', keyboardLock: 'unsupported', platform: family });
    const tip = page.getByTestId('alt-f4-tip');
    if (family === 'mac') {
      await expect(tip).toHaveCount(0);
      return;
    }
    await expect(tip).toBeVisible();
    await tabTo(page, button(page, 'Dismiss'));
    await page.keyboard.press('Enter');
    await expect(tip).toHaveCount(0);
    await button(page, 'Mission menu').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mission-menu')).toBeVisible();
    await button(page, 'Restart mission').focus();
    await page.keyboard.press('Enter');
    await waitForFrame(page, frame => frame.position === 'intro');
    await expect(button(page, 'Skip')).toBeFocused();
    await page.keyboard.press('Space');
    await waitForFrame(page, frame => frame.position === 'config');
    await button(page, 'Start').focus();
    await page.keyboard.press('Enter');
    await waitForFrame(page, frame => frame.position === 'departure');
    await expect(button(page, 'Skip')).toBeFocused();
    await page.keyboard.press('Space');
    await waitForFrame(page, frame => frame.position === 'flight');
    await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
    await expect(tip).toHaveCount(0);
  });
}

import type { Page } from '@playwright/test';
import { expect, test } from './support/audited-test.ts';
import {
  attachResponsiveness, describeResponsiveness, installResponsiveness, installResponsivenessProbe, measureResponsiveness, ResponsivenessWindow,
  type ResponsivenessRecord,
} from './support/responsiveness.ts';

// P2-12 subtask 03 (S-05, AC-05): control samples for the responsiveness probe, in both projects on the production App
// under the network audit. A main-thread block longer than the Long Tasks API's 50 ms is detected with its frame gap,
// also when it ends just before the window closes or page code opens the window inside it; an idle window and a block
// shorter than 50 ms report no long task; an unavailable API and records that never arrive are errors rather than zero.

const BLOCK_MS = 120;
const SHORT_MS = 25;

async function openApp(page: Page, probe = true): Promise<void> {
  if (probe) await installResponsiveness(page);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
}

/**
 * Applies `fault` to the loaded page and then installs the probe there, so the probe certainly sees the fault (the order
 * of several init scripts is not defined).
 */
async function installAfter(page: Page, fault: () => void): Promise<void> {
  await openApp(page, false);
  await page.evaluate(fault);
  await page.evaluate(installResponsivenessProbe);
}

/**
 * Blocks the main thread for `ms` in a task of its own, first opening a window of `open` from inside that task when
 * given; resolves once the block ran, or at once when `wait` is false.
 */
const block = (page: Page, ms: number, { wait = true, open }: { wait?: boolean; open?: string } = {}): Promise<void> =>
  page.evaluate(({ duration, wait, open }) => {
    const ran = new Promise<void>(resolve => {
      setTimeout(() => {
        if (open !== undefined) window.osrResponsiveness!.open(open);
        const start = performance.now();
        while (performance.now() - start < duration) { /* blocking on purpose */ }
        resolve();
      }, 0);
    });
    return wait ? ran : undefined;
  }, { duration: ms, wait, open });

/** Resolves after `count` frames. */
const frames = (page: Page, count: number): Promise<void> => page.evaluate(total => new Promise<void>(resolve => {
  let seen = 0;
  requestAnimationFrame(function next() { if (++seen >= total) resolve(); else requestAnimationFrame(next); });
}), count);

const visible = { start: 'visible', end: 'visible' };

test('a main-thread block over 50 ms is a long task with its frame gap, also when it ends at close or opens the window itself', async ({ page }, testInfo) => {
  await openApp(page);
  const records: ResponsivenessRecord[] = [];
  const blocked = await measureResponsiveness(page, 'control: blocked main thread', async () => {
    await frames(page, 3);
    await block(page, BLOCK_MS);
    await frames(page, 3);
  });
  records.push(blocked);
  expect(blocked.longTaskCount).toBeGreaterThanOrEqual(1);
  expect(blocked.longestTaskMs).toBeGreaterThanOrEqual(BLOCK_MS - 5);
  expect(blocked.maxFrameIntervalMs).toBeGreaterThanOrEqual(BLOCK_MS - 5);
  expect(blocked.frames).toBeGreaterThanOrEqual(6);
  expect(blocked.environment.visibility).toEqual(visible);
  for (const { startMs, durationMs } of blocked.longTasks) {
    expect(startMs).toBeLessThan(blocked.endMs);
    expect(startMs + durationMs).toBeGreaterThan(blocked.startMs);
  }

  // Queued without waiting: the block runs right before or while the window closes, and its record is not lost.
  const ending = await ResponsivenessWindow.open(page, 'control: block ending at close');
  await block(page, BLOCK_MS, { wait: false });
  const late = await ending.close();
  records.push(late);
  expect(late.longTaskCount).toBeGreaterThanOrEqual(1);
  expect(late.longestTaskMs).toBeGreaterThanOrEqual(BLOCK_MS - 5);

  // Page code opens a window at the exact start of its work, inside the task that then blocks; the test adopts it.
  await block(page, BLOCK_MS, { open: 'control: opened by the page' });
  const adopted = await (await ResponsivenessWindow.adopt(page, 'control: opened by the page')).close();
  records.push(adopted);
  expect(adopted.longTaskCount).toBeGreaterThanOrEqual(1);
  expect(adopted.longestTaskMs).toBeGreaterThanOrEqual(BLOCK_MS - 5);
  expect(adopted.longTasks[0].startMs).toBeLessThanOrEqual(adopted.startMs);
  await expect(ResponsivenessWindow.adopt(page, 'control: opened by the page')).rejects.toThrow('No open responsiveness window of control: opened by the page');
  for (const record of records) console.info(`${testInfo.project.name} ${describeResponsiveness(record)}`);
  await attachResponsiveness(testInfo, records);
});

test('an idle window and a 25 ms block report no long task', async ({ page }, testInfo) => {
  await openApp(page);
  const idle = await measureResponsiveness(page, 'control: idle', () => frames(page, 30));
  expect(idle.longTaskCount).toBe(0);
  expect(idle.longestTaskMs).toBeNull();
  expect(idle.frames).toBeGreaterThanOrEqual(30);
  expect(idle.maxFrameIntervalMs).toBeLessThan(50);
  expect(idle.environment.visibility).toEqual(visible);
  const short = await measureResponsiveness(page, 'control: 25 ms block', async () => {
    await frames(page, 3);
    await block(page, SHORT_MS);
    await frames(page, 3);
  });
  expect(short.longTaskCount).toBe(0);
  expect(short.maxFrameIntervalMs).toBeGreaterThanOrEqual(SHORT_MS);
  for (const record of [idle, short]) console.info(`${testInfo.project.name} ${describeResponsiveness(record)}`);
  await attachResponsiveness(testInfo, [idle, short]);
});

test('without the Long Tasks API the probe fails rather than reporting zero', async ({ page }) => {
  // The browser then lists no longtask entries.
  await installAfter(page, () => {
    const supported = PerformanceObserver.supportedEntryTypes.filter(entry => entry !== 'longtask');
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', { configurable: true, get: () => supported });
  });
  expect(await page.evaluate(() => window.osrResponsiveness?.unavailable)).toBe('The Long Tasks API is unavailable: PerformanceObserver does not support longtask entries');
  await expect(ResponsivenessWindow.open(page, 'control: unavailable')).rejects.toThrow('The Long Tasks API is unavailable');
});

test('records that never arrive fail the window rather than reporting zero', async ({ page }) => {
  // The observer is accepted but never delivers anything.
  await installAfter(page, () => { PerformanceObserver.prototype.observe = () => undefined; });
  const undelivered = await ResponsivenessWindow.open(page, 'control: undelivered');
  await block(page, BLOCK_MS);
  await expect(undelivered.close()).rejects.toThrow('Long task records were not delivered within 2000 ms of closing the control: undelivered window');
});

import { expect, type Dialog, type Page } from '@playwright/test';
import type { SliceGapId } from '../../src/ui/mission/slice-gaps-copy.ts';
import { button } from './app-entry.ts';

// Observations of the P3-04 mission flow (docs/plan/p3/04/spec.md: 应用流程, 衔接占位, 离页保护, 开发诊断). Run evidence
// comes from the mission screen's read-only `data-owner`, `data-run`, `data-tick` and `data-position` attributes in
// both builds, and in development builds also from the diagnostics panel. Reads go through page evaluations, so no
// Playwright main-world script adds listeners a resource balance would count. Nothing here writes application state:
// the flow advances only through trusted input on the page's own controls.

/** The mission screen's evidence attributes; null fields are empty attributes, such as the run before a start. */
export interface MissionFrame {
  readonly owner: number | null;
  readonly run: number | null;
  readonly tick: number | null;
  readonly position: string | null;
}

/** The mission screen's attributes, or null while no mission screen shows. */
export function missionFrame(page: Page): Promise<MissionFrame | null> {
  return page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
    if (!screen) return null;
    const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
    return { owner: number(screen.dataset.owner), run: number(screen.dataset.run), tick: number(screen.dataset.tick), position: screen.dataset.position ?? null };
  });
}

/** Reads every 25 ms until `accept` holds for the value read, and resolves to it; fails with `what` after `timeout` ms. */
async function poll<T, Accepted extends T>(read: () => Promise<T>, accept: (value: T) => value is Accepted, what: string, timeout: number): Promise<Accepted> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    if (Date.now() >= deadline) throw new Error(`${what}; last ${JSON.stringify(value)}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/** Polls the mission screen until `accept` holds, and resolves to that frame. */
export function waitForFrame(page: Page, accept: (frame: MissionFrame) => boolean, timeout = 10_000): Promise<MissionFrame> {
  return poll(() => missionFrame(page), (frame): frame is MissionFrame => frame !== null && accept(frame), 'The mission screen did not reach the expected state', timeout);
}

/** One reading of the mission screen at the page's monotonic time. */
export interface FrameSample extends MissionFrame {
  readonly time: number;
}

/** Samples the mission screen every `interval` ms for `duration` ms inside the page. */
export function frameSamples(page: Page, duration = 600, interval = 50): Promise<FrameSample[]> {
  return page.evaluate(async ({ duration, interval }) => {
    const read = () => {
      const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
      if (!screen) throw new Error('No mission screen to sample');
      const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
      return {
        owner: number(screen.dataset.owner), run: number(screen.dataset.run), tick: number(screen.dataset.tick),
        position: screen.dataset.position ?? null, time: performance.now(),
      };
    };
    const samples = [read()];
    while (samples.at(-1)!.time - samples[0].time < duration) {
      await new Promise(resolve => setTimeout(resolve, interval));
      samples.push(read());
    }
    return samples;
  }, { duration, interval });
}

/** Expects the run's tick to stay put for `duration` ms, as while paused, in the menu or held, and returns it. */
export async function expectStableTick(page: Page, duration = 600): Promise<number> {
  const samples = await frameSamples(page, duration);
  const [first] = samples;
  expect(first.tick, 'A stable tick needs a run').not.toBeNull();
  expect(samples.at(-1)!.time - first.time).toBeGreaterThanOrEqual(duration);
  expect(new Set(samples.map(({ owner, run, tick, position }) => `${owner}/${run}/${tick}/${position}`)).size, 'The run moved').toBe(1);
  return first.tick!;
}

/** Expects the same run's tick to advance within `duration` ms, and returns the first and last ticks seen. */
export async function expectAdvancingTick(page: Page, duration = 600): Promise<{ readonly from: number; readonly to: number }> {
  const samples = await frameSamples(page, duration);
  const [first] = samples;
  const last = samples.at(-1)!;
  expect(first.tick, 'An advancing tick needs a run').not.toBeNull();
  expect(new Set(samples.map(({ owner, run }) => `${owner}/${run}`)).size, 'The run changed').toBe(1);
  for (const [index, sample] of samples.entries()) if (index > 0) expect(sample.tick!).toBeGreaterThanOrEqual(samples[index - 1].tick!);
  expect(last.tick!, 'The tick did not advance').toBeGreaterThan(first.tick!);
  return { from: first.tick!, to: last.tick! };
}

/** The main menu's mission entry. */
export const missionEntry = (page: Page) => button(page, 'Start mission');

/**
 * The listeners of a mission owner's flight surface (P3-12) while the owner exists, by type: the pixel-ratio media
 * query's `change`, and on the canvas Three.js's and the surface's context loss and restoration, and Three.js's context
 * creation error.
 */
export const FLIGHT_SURFACE_LISTENERS = Object.freeze([
  'change', 'webglcontextcreationerror', 'webglcontextlost', 'webglcontextlost', 'webglcontextrestored', 'webglcontextrestored',
]);

/**
 * In flight with WebGL 2 (P3-12): the owner's flight canvas, named and drawing in the flight area, the only connected
 * WebGL canvas the probes know, with a live context, and the hidden 2D map cursor.
 */
export async function expectFlightCanvas(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toHaveCount(2);
  const flight = page.getByTestId('flight-area').locator('canvas');
  await expect(flight).toHaveCount(1);
  await expect(flight).toHaveAttribute('role', 'img');
  await expect(flight).toHaveAttribute('aria-label', 'Flight view');
  await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'ready');
  await expectHiddenMapCursor(page);
  expect(await page.evaluate(() => window.osrProbe.snapshot().canvases.filter(({ connected }) => connected).map(({ extension, lost }) => ({ extension, lost }))))
    .toEqual([{ extension: true, lost: false }]);
}

/** The game input zone's hidden 2D map cursor, which takes no pointer events. */
async function expectHiddenMapCursor(page: Page): Promise<void> {
  const cursor = page.getByTestId('game-input-zone').locator('canvas[aria-hidden="true"]');
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toBeHidden();
  await expect(cursor).toHaveCSS('pointer-events', 'none');
  expect(await cursor.evaluate(canvas => canvas instanceof HTMLCanvasElement && canvas.getContext('2d') !== null)).toBe(true);
}

/** In flight without WebGL 2, the only canvas is the hidden 2D map cursor, not a WebGL scene. */
export async function expectFlightCursorWithoutWebGL(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expectHiddenMapCursor(page);
  expect(await page.evaluate(() => window.osrProbe.snapshot().canvases)).toEqual([]);
}

/** Opens the mission from the main menu's entry and waits for its introduction placeholder; resolves to its frame. */
export async function enterMission(page: Page): Promise<MissionFrame> {
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await missionEntry(page).click();
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/1');
  return waitForFrame(page, frame => frame.owner !== null && frame.position === 'intro');
}

/** How a G-02 placeholder ends: its skip button, a new Enter, Space or Esc press, or 3 s of visible time. */
export type PlaceholderEnd = 'button' | 'Enter' | 'Space' | 'Escape' | 'natural';

const KEYS: Readonly<Record<Exclude<PlaceholderEnd, 'button' | 'natural'>, string>> = Object.freeze({ Enter: 'Enter', Space: ' ', Escape: 'Escape' });

declare global {
  interface Window {
    osrPositions?: { readonly log: { readonly position: string | null; readonly time: number }[]; readonly observer: MutationObserver };
  }
}

/**
 * Starts logging, with the page's monotonic clock, every change of the mission screen's position as the DOM commits
 * it, so a natural placeholder end can be timed from its first frame. Install it before the placeholder appears; a new
 * call replaces the previous log, and `stopWatchingPositions` ends it.
 */
export function watchPositions(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.osrPositions?.observer.disconnect();
    const log: { position: string | null; time: number }[] = [];
    let last: string | null | undefined;
    const record = (): void => {
      const position = document.querySelector('[data-testid="mission-screen"]')?.getAttribute('data-position') ?? null;
      if (position === last) return;
      last = position;
      log.push({ position, time: performance.now() });
    };
    record();
    const observer = new MutationObserver(record);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-position'] });
    window.osrPositions = { log, observer };
  });
}

/** Ends the `watchPositions` log, so no test observer outlives the measurement. */
export function stopWatchingPositions(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.osrPositions?.observer.disconnect();
    delete window.osrPositions;
  });
}

/** The `watchPositions` log so far: each position the mission screen committed, with the time it did. */
async function positionLog(page: Page): Promise<{ readonly position: string | null; readonly time: number }[]> {
  const log = await page.evaluate(() => window.osrPositions?.log.map(entry => ({ ...entry })) ?? null);
  if (!log) throw new Error('watchPositions was not installed');
  return log;
}

/**
 * Every position the mission screen committed since `watchPositions`, in order, however briefly each showed: a
 * position a few ticks long, such as the flight of a run that faults at once, can end between two polls.
 */
export async function watchedPositions(page: Page): Promise<(string | null)[]> {
  return (await positionLog(page)).map(({ position }) => position);
}

/** How long the mission screen showed `from` before it last changed to `to`, by the `watchPositions` log. */
async function shownFor(page: Page, from: string, to: string): Promise<number> {
  const log = await positionLog(page);
  const end = log.findLastIndex(entry => entry.position === to);
  if (end < 1 || log[end - 1].position !== from) throw new Error(`No change from ${from} to ${to}: ${JSON.stringify(log)}`);
  return log[end].time - log[end - 1].time;
}

/** Where each G-02 placeholder shows and where its end leads. */
const PLACEHOLDER_POSITIONS = Object.freeze({
  'G-02/1': ['intro', 'config'], 'G-02/2': ['departure', 'flight'], 'G-02/3': ['transition', 'flight'], 'G-02/4': ['transition', 'flight'],
} as const);

/**
 * Ends the shown G-02 placeholder by `end` and waits for the position after it: the introduction leads to the start
 * page, the departure and a running hold's docking or launch placeholder (P3-10, the hold's only item) to flight. Focus
 * must be on its skip button first. A natural end needs `watchPositions` installed before the placeholder appeared, and
 * must come only after about 3,000 ms of visible time (the exact boundary is a Node test). Resolves to the frame after it.
 */
export async function endPlaceholder(page: Page, gap: keyof typeof PLACEHOLDER_POSITIONS, end: PlaceholderEnd): Promise<MissionFrame> {
  const [from, to] = PLACEHOLDER_POSITIONS[gap];
  if (end === 'natural') {
    const frame = await waitForFrame(page, candidate => candidate.position === to, 15_000);
    expect(await shownFor(page, from, to), 'A placeholder ended before 3 s of visible time').toBeGreaterThanOrEqual(2_900);
    return frame;
  }
  await skipPlaceholder(page, gap, end);
  return waitForFrame(page, frame => frame.position === to);
}

/**
 * Ends the shown G-02 placeholder `gap` by its skip button or a key, with focus on that button first, without waiting
 * for the position after it.
 */
export async function skipPlaceholder(page: Page, gap: keyof typeof PLACEHOLDER_POSITIONS, end: Exclude<PlaceholderEnd, 'natural'>): Promise<void> {
  const placeholder = page.getByTestId('mission-placeholder');
  await expect(placeholder).toHaveAttribute('data-gap', gap);
  await expect(placeholder).toHaveAttribute('data-status', 'timing');
  await expect(button(page, 'Skip')).toBeFocused();
  if (end === 'button') await button(page, 'Skip').click();
  else await page.keyboard.press(KEYS[end]);
}

/**
 * Holds `key` across a page change: one new press, then, once `next` confirmed the page it led to, `repeats`
 * auto-repeated keydowns (`repeat: true`) and the keyup tail. The first press acts on the focused control; the repeats
 * and the tail must not act on the page that follows.
 */
export async function holdKey<T>(page: Page, key: 'Enter' | ' ', next: () => Promise<T>, repeats = 3): Promise<T> {
  await page.keyboard.down(key);
  try {
    const result = await next();
    for (let index = 0; index < repeats; index++) await page.keyboard.down(key);
    return result;
  } finally {
    await page.keyboard.up(key);
  }
}

/** A slice-gap note the page shows: its G ID and its whole text. */
export interface ShownGap {
  readonly id: SliceGapId;
  readonly text: string;
}

/**
 * Every visible slice-gap note of the current page, in document order, duplicates included. The flight status bar's
 * short G-01 label is not a note; read it from `mission-status`.
 */
export function shownGaps(page: Page): Promise<ShownGap[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slice-gap[data-gap]')]
    .filter(element => element.checkVisibility())
    .map(element => ({ id: element.dataset.gap as SliceGapId, text: (element.textContent ?? '').replace(/\s+/g, ' ').trim() })));
}

/**
 * Expects the current page to show exactly the slice-gap notes `ids`, each once, in any order, each visible note
 * naming its G ID; resolves to them.
 */
export async function expectGaps(page: Page, ids: readonly SliceGapId[]): Promise<ShownGap[]> {
  const shown = await shownGaps(page);
  expect(shown.map(({ id }) => id).toSorted()).toEqual([...ids].toSorted());
  for (const { id, text } of shown) expect(text).toContain(`(${id}).`);
  return shown;
}

/** The start page's checked wingman choice: an option index, or null for no wingman. */
export async function checkedWingman(page: Page): Promise<number | null | undefined> {
  const value = await page.evaluate(() => document.querySelector<HTMLInputElement>('[data-testid="mission-wingmen"] input[type="radio"]:checked')?.dataset.wingman);
  if (value === undefined) return undefined;
  return value === 'none' ? null : Number(value);
}

/** Chooses a wingman option on the start page by its index, or no wingman. */
export async function chooseWingman(page: Page, wingman: number | null): Promise<void> {
  const radio = page.locator(`[data-testid="mission-wingmen"] input[data-wingman="${wingman ?? 'none'}"]`);
  await radio.check();
  expect(await checkedWingman(page)).toBe(wingman);
}

/** How many `beforeunload` listeners the application holds now, by the browser probes (`browser-probes.ts`). */
export function leaveGuards(page: Page): Promise<number> {
  return page.evaluate(() => window.osrProbe.snapshot().listeners.filter(listener => listener.type === 'beforeunload' && listener.active && listener.group === 'other').length);
}

/** A real navigation or close the browser itself asks to confirm when the page wants it. */
export type LeaveRequest = 'reload' | 'close';

/**
 * Requests a real leave of the page, waits for the browser's native confirmation and answers it with `answer`; resolves
 * to the dialog's type, and fails when none shows within 5 s. `reload` is the browser's reload (CDP `Page.reload`,
 * which unlike `page.reload()` does not wait for a load the dismissed dialog cancels); `close` closes the page through
 * Playwright's `runBeforeUnload` path. After `accept` the reload or close goes on. The handler is a `page.on` listener on
 * purpose: without one, Playwright accepts a `beforeunload` dialog itself, and `waitForEvent` does not prevent that.
 */
export async function requestLeave(page: Page, request: LeaveRequest, answer: 'accept' | 'dismiss'): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onDialog: ((dialog: Dialog) => void) | undefined;
  const shown = new Promise<string>((resolve, reject) => {
    onDialog = dialog => {
      resolve(dialog.type());
      // Accepting a close ends the page, and with it the answer's own round trip.
      (answer === 'accept' ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
    };
    timer = setTimeout(() => { reject(new Error(`No leave confirmation for the ${request}`)); }, 5_000);
  });
  page.on('dialog', onDialog!);
  try {
    if (request === 'close') {
      await page.close({ runBeforeUnload: true });
    } else {
      const session = await page.context().newCDPSession(page);
      try {
        await session.send('Page.reload');
      } finally {
        await session.detach().catch(() => undefined);
      }
    }
    return await shown;
  } finally {
    clearTimeout(timer);
    page.off('dialog', onDialog!);
  }
}

/** Reloads the page and expects the browser to ask nothing: no `beforeunload` confirmation is requested. */
export async function reloadWithoutConfirmation(page: Page): Promise<void> {
  const shown: string[] = [];
  const onDialog = (dialog: Dialog): void => {
    shown.push(dialog.type());
    void dialog.dismiss();
  };
  page.on('dialog', onDialog);
  try {
    await page.reload({ timeout: 15_000 });
  } finally {
    page.off('dialog', onDialog);
  }
  expect(shown, 'The reload asked for confirmation').toEqual([]);
}

/** The diagnostics panel's state section after a refresh (development builds). */
export interface DevState {
  readonly run: number;
  readonly tick: number;
  readonly seed: number;
  /** The run's wingman option, or null for none. */
  readonly wingman: number | null;
  readonly player: number | null;
  /** The player's view mode and the previous one. */
  readonly viewMode: number;
  readonly previousViewMode: number;
  readonly entities: readonly { readonly id: number; readonly kindBit: number; readonly source: string }[];
}

function readDevState(page: Page): Promise<DevState | null> {
  return page.evaluate(() => {
    const text = (id: string): string | null => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
    const run = text('dev-state-run');
    if (run === null) return null;
    const wingman = text('dev-state-wingman');
    const player = /^entity (\d+|none), view mode 0x([0-9a-f]+) \(previous 0x([0-9a-f]+)\)/.exec(text('dev-state-player') ?? '');
    if (!player) throw new Error('Unreadable player state');
    return {
      run: Number(run), tick: Number(text('dev-state-tick')), seed: Number(text('dev-state-seed')),
      wingman: wingman === 'none' ? null : Number(wingman), player: player[1] === 'none' ? null : Number(player[1]),
      viewMode: parseInt(player[2], 16), previousViewMode: parseInt(player[3], 16),
      entities: [...document.querySelectorAll<HTMLElement>('[data-testid="dev-entity"]')].map(row => ({
        id: Number(row.dataset.entityId), kindBit: Number(row.dataset.kindBit), source: row.dataset.source ?? '',
      })),
    };
  });
}

/** Refreshes the diagnostics panel's state from the current run's snapshot and reads it (development builds). */
export async function devState(page: Page): Promise<DevState> {
  const before = await missionFrame(page);
  await button(page, 'Refresh state').click();
  // The state is read on the click; wait until it shows this run at or after the tick the screen showed before it.
  return poll(
    () => readDevState(page), (state): state is DevState => state !== null && state.run === before?.run && state.tick >= (before.tick ?? 0),
    'The diagnostics did not show the current run', 5_000,
  );
}

/** A command the diagnostics panel submitted, with the terminal result the panel shows for it. */
export interface DevCommand {
  readonly run: number;
  readonly commandId: number;
  readonly outcome: string;
  readonly reason: string | null;
}

/**
 * Submits the command editor's current command through the run's queue and waits until the panel shows its result and
 * the event log its `command-result` event, both under the commandId the submit acknowledged (development builds).
 */
export async function submitDevCommand(page: Page): Promise<DevCommand> {
  await page.getByTestId('dev-command-submit').click();
  const submitted = /^Submitted command #(\d+) to run (\d+)\.$/.exec(await page.getByTestId('dev-command-submitted').innerText());
  if (!submitted) throw new Error('No command acknowledgement');
  const [commandId, run] = [Number(submitted[1]), Number(submitted[2])];
  // The event log follows the panel's sampling, so its entry may show a little after the result.
  const result = await poll(() => page.evaluate(({ commandId, run }) => {
    const item = [...document.querySelectorAll<HTMLElement>(`[data-testid="dev-results"] li[data-command-id="${commandId}"]`)]
      .find(element => element.textContent?.startsWith(`run ${run} · #${commandId} `));
    const logged = document.querySelector(`[data-testid="dev-log"] li[data-type="command-result"][data-command-id="${commandId}"]`) !== null;
    return item && logged ? { outcome: item.dataset.outcome ?? '', reason: item.dataset.reason ?? null } : null;
  }, { commandId, run }), (value): value is { outcome: string; reason: string | null } => value !== null, `Command #${commandId} of run ${run} got no logged result`, 5_000);
  return { run, commandId, ...result };
}

/** Records the page's frames for `duration` ms with the browser probes, as resource checks read them. */
export async function frameWindow(page: Page, duration = 400) {
  return page.evaluate(async milliseconds => {
    window.osrProbe.resetFrames();
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    return window.osrProbe.snapshot();
  }, duration);
}

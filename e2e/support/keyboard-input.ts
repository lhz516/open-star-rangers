import { expect, type Locator, type Page } from '@playwright/test';
import { readTickInput, type TickInput } from '../../src/core/contracts/tick-input.ts';
import { scenarioFiles } from '../../src/workers/import-scenarios.test-support.ts';
import { button, filePayloads, importFiles, type TestEntryOptions } from './app-entry.ts';
import { endPlaceholder, enterMission, missionEntry, missionFrame, waitForFrame } from './mission-observations.ts';
import { missionPackage, seedProductionCache } from './production-cache.ts';

export type KeyboardBuild = 'development' | 'production';

let developmentMissionFiles: ReturnType<typeof filePayloads> | undefined;

export interface KeyboardEventRecord {
  readonly type: 'keydown' | 'keyup';
  readonly code: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly altGraph: boolean;
  readonly isComposing: boolean;
  readonly defaultPrevented: boolean;
  readonly target: string;
}

declare global {
  interface Window {
    osrKeyboardEvents?: KeyboardEventRecord[];
    osrVisibilityEvents?: DocumentVisibilityState[];
  }
}

/** Opens the build's menu with only the synthetic, startable mission package available. */
export async function openKeyboardMenu(page: Page, build: KeyboardBuild, options: TestEntryOptions = {}): Promise<void> {
  if (build === 'development') {
    developmentMissionFiles ??= scenarioFiles('mission-startable').then(files => filePayloads([...files]));
    await importFiles(page, await developmentMissionFiles, {
      worker: 'mission-startable',
      ...options,
    }, /Mission (?:loads|does not load) into Core/);
    await button(page, 'Return to menu').click();
  } else {
    await page.goto('/');
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
    await seedProductionCache(page, await missionPackage());
    await page.reload();
    await button(page, 'Open saved resources').click();
    await expect(page.getByTestId('resource-statuses').getByText('Mission loads into Core', { exact: true })).toBeVisible({ timeout: 30_000 });
  }
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

/** Moves focus with Tab (or Shift+Tab) until `target` has it; fails after `limit` presses. */
export async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab', limit = 20): Promise<void> {
  for (let press = 0; press < limit; press += 1) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

/** Starts the synthetic mission in flight, ending both visible placeholders through their own buttons. */
export async function startKeyboardFlight(page: Page): Promise<void> {
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
}

/** Records native and test-dispatched keyboard events after the app's own input listener handles them. */
export async function watchKeyboardEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.osrKeyboardEvents = [];
    const record = (event: Event): void => {
      const keyboard = event as KeyboardEvent;
      const target = event.target instanceof Element
        ? (event.target.closest('[data-testid]')?.getAttribute('data-testid') ?? event.target.tagName.toLowerCase())
        : event.target === document ? 'document' : 'other';
      window.osrKeyboardEvents!.push({
        type: keyboard.type as 'keydown' | 'keyup',
        code: keyboard.code,
        repeat: keyboard.repeat,
        shiftKey: keyboard.shiftKey,
        ctrlKey: keyboard.ctrlKey,
        altKey: keyboard.altKey,
        metaKey: keyboard.metaKey,
        altGraph: keyboard.getModifierState('AltGraph'),
        isComposing: keyboard.isComposing,
        defaultPrevented: keyboard.defaultPrevented,
        target,
      });
    };
    document.addEventListener('keydown', record);
    document.addEventListener('keyup', record);
  });
}

export const keyboardEvents = (page: Page): Promise<KeyboardEventRecord[]> =>
  page.evaluate(() => [...(window.osrKeyboardEvents ?? [])]);

export interface DispatchKeyboardInput {
  readonly type: 'keydown' | 'keyup';
  readonly code: string;
  readonly key: string;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly altGraph?: boolean;
  readonly isComposing?: boolean;
}

/** Sends a page-level KeyboardEvent to the focused element; this does not emulate a trusted OS/browser shortcut. */
export function dispatchKeyboardEvent(page: Page, input: DispatchKeyboardInput): Promise<boolean> {
  return page.evaluate(value => {
    const target = document.activeElement;
    if (!target) throw new Error('There is no focused element for the keyboard event');
    const event = new KeyboardEvent(value.type, {
      code: value.code,
      key: value.key,
      bubbles: true,
      cancelable: true,
      repeat: value.repeat ?? false,
      shiftKey: value.shiftKey ?? false,
      ctrlKey: value.ctrlKey ?? false,
      altKey: value.altKey ?? false,
      metaKey: value.metaKey ?? false,
      isComposing: value.isComposing ?? false,
    });
    if (value.altGraph !== undefined) {
      Object.defineProperty(event, 'getModifierState', {
        value: (modifier: string) => modifier === 'AltGraph' ? value.altGraph : false,
      });
    }
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, input);
}

/** Observes only genuine document visibility notifications; it never changes the browser's visibility state. */
export async function watchVisibility(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.osrVisibilityEvents = [];
    document.addEventListener('visibilitychange', () => {
      window.osrVisibilityEvents!.push(document.visibilityState);
    });
  });
}

export const visibilityEvents = (page: Page): Promise<DocumentVisibilityState[]> =>
  page.evaluate(() => [...(window.osrVisibilityEvents ?? [])]);

/** Reads only the public tick input from an exported recording file. */
export async function readExportedTickInputs(path: string): Promise<readonly TickInput[]> {
  const { readFile } = await import('node:fs/promises');
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof value !== 'object' || value === null || !('record' in value)
    || typeof value.record !== 'object' || value.record === null || !('ticks' in value.record) || !Array.isArray(value.record.ticks)) {
    throw new Error('The exported recording has no tick inputs');
  }
  return value.record.ticks.map(readTickInput);
}

/** Waits for one actual game tick after `tick`, failing if the run disappears. */
export async function waitForTickAfter(page: Page, tick: number): Promise<number> {
  await expect.poll(async () => (await missionFrame(page))?.tick ?? null).toBeGreaterThan(tick);
  const frame = await missionFrame(page);
  if (frame?.tick === null || frame?.tick === undefined) throw new Error('The mission run ended before the next tick');
  return frame.tick;
}

/** Downloads the development panel's recording of the current run to `path`. */
export async function saveRecording(page: Page, path: string): Promise<void> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('dev-recording-export').click(),
  ]);
  await download.saveAs(path);
  if (await download.failure()) throw new Error('The browser failed to save the recording');
}

/** Submits a one-off dev recording download and parses only its public tick input. */
export async function exportedTickInputs(page: Page, path: string): Promise<readonly TickInput[]> {
  await saveRecording(page, path);
  return readExportedTickInputs(path);
}

import { expect, type Page } from '@playwright/test';
import { MISSION_SKELETON } from '../../src/ui/mission/mission-copy.ts';
import type { ExpectedPackageProfile } from '../../src/workers/production-package.ts';
import { sliceCoveredFiles, syntheticImport } from '../../src/workers/synthetic-import.test-support.ts';

// The P2-11 development test entry: the production App with synthetic ports chosen by the page query (see
// src/app/app-entry.test-support.tsx). The development server alone serves it.

declare global {
  interface Window {
    osrTestEntry?: {
      readonly profile: ExpectedPackageProfile;
      readonly cache: {
        held(operation: 'commit' | 'list' | 'restore'): number;
        release(operation: 'commit' | 'list' | 'restore'): number;
      };
    };
  }
}

export interface TestEntryOptions {
  /** An import Worker scenario of import-scenarios.test-support.ts, `production` or `missing`; `models` by default. */
  readonly worker?: string;
  /** `unavailable`, or a P2-10 failure code the first commit returns. */
  readonly cache?: string;
  readonly capacity?: 'insufficient';
  /** `unavailable` for audio without Web Audio. */
  readonly audio?: 'unavailable';
  /**
   * Comma-separated cache operations, such as `commit,restore`, whose settled results wait until `releaseCacheResults`
   * delivers them (P2-12 F-12).
   */
  readonly hold?: string;
  /**
   * Comma-separated uint32 values, at most 16, that the mission's seed source draws in order, one per world creation
   * attempt; after them it draws from `crypto.getRandomValues` (P3-04 S-09).
   */
  readonly seeds?: string;
}

/** A cache operation whose results the `hold` option can delay. */
export type HeldCacheOperation = 'commit' | 'list' | 'restore';

/** How many settled results of `operation` wait for release. */
export const heldCacheResults = (page: Page, operation: HeldCacheOperation): Promise<number> =>
  page.evaluate(name => window.osrTestEntry!.cache.held(name), operation);

/** Delivers every waiting result of `operation`, in call order, and resolves to how many there were. */
export const releaseCacheResults = (page: Page, operation: HeldCacheOperation): Promise<number> =>
  page.evaluate(name => window.osrTestEntry!.cache.release(name), operation);

export async function openTestEntry(page: Page, options: TestEntryOptions = {}): Promise<void> {
  const query = new URLSearchParams(Object.entries(options).filter((entry): entry is [string, string] => entry[1] !== undefined));
  await page.goto(`/e2e/entries/app.html${query.size > 0 ? `?${query}` : ''}`);
}

/**
 * P2-11 AC-01 as P3-04 revised it (docs/plan/p3/04/spec.md, 合成演示退役): no page text claims the original gameplay is
 * playable or offers to play it. The build's own disclaimer, that it is the formal runtime skeleton and not yet a
 * playable slice, is not such a claim; where the main menu's mission entry shows, it is enabled only when its start
 * eligibility admits it, and its description carries that disclaimer.
 */
export async function expectNoPlayClaim(page: Page): Promise<void> {
  // The disclaimer is left out of the search below, so it must itself stay one.
  expect(MISSION_SKELETON).toContain('not yet a playable slice');
  expect((await page.locator('body').innerText()).replaceAll(MISSION_SKELETON, '')).not.toMatch(/playable|play mission/i);
  const entry = button(page, 'Start mission');
  if (await entry.count() === 0) return;
  expect(await entry.isEnabled(), 'the mission entry is enabled only when eligible').toBe(await entry.getAttribute('data-eligibility') === 'eligible');
  await expect(page.locator('#mission-entry-description')).toContainText(MISSION_SKELETON);
}

/** A file for the import page's file chooser. */
export interface FilePayload { readonly name: string; readonly mimeType: string; readonly buffer: Buffer }

/** Files for the file chooser, such as the files of a failure matrix case. */
export const filePayloads = (files: readonly File[]): Promise<FilePayload[]> =>
  Promise.all(files.map(async file => ({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(await file.arrayBuffer()) })));

/** The CloneCD files of a synthetic disc holding `covered`, whose names contain the file-name marker. */
export async function discFiles(covered: Parameters<typeof syntheticImport>[0]): Promise<FilePayload[]> {
  return filePayloads((await syntheticImport(covered)).files);
}

let slice: Promise<FilePayload[]> | undefined;
/** The synthetic slice disc every converting scenario identifies, generated once per worker process. */
export const sliceFiles = (): Promise<FilePayload[]> => slice ??= discFiles(sliceCoveredFiles());

/** A button by its exact accessible name. */
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/**
 * Opens the test entry, imports `files` and waits until the import statuses show `until`; the page stays on the import
 * screen.
 */
export async function importFiles(page: Page, files: readonly FilePayload[], options: TestEntryOptions = {}, until: string | RegExp = /Complete resources, viewable|Partial conversion/): Promise<void> {
  await openTestEntry(page, options);
  await expect(page.getByTestId('original-data-status')).not.toContainText('Checking');
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles([...files]);
  await button(page, 'Start import').click();
  await expect(page.getByTestId('import-statuses')).toContainText(until, { timeout: 60_000 });
}

/** A small file with synthetic text content, for start rules and Worker scenarios that never read it. */
export const smallFile = (name: string): FilePayload => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(`synthetic ${name}`) });

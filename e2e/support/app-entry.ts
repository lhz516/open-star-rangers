import { expect, type Page } from '@playwright/test';
import type { ExpectedPackageProfile } from '../../src/workers/production-package.ts';
import { sliceCoveredFiles, syntheticImport } from '../../src/workers/synthetic-import.test-support.ts';

// The P2-11 development test entry: the production App with synthetic ports chosen by the page query (see
// src/app/app-entry.test-support.tsx). The development server alone serves it.

declare global {
  interface Window { osrTestEntry?: { readonly profile: ExpectedPackageProfile } }
}

export interface TestEntryOptions {
  /** The import Worker scenario, `production` or `missing`; `models` by default. */
  readonly worker?: string;
  /** `unavailable`, or a P2-10 failure code the first commit returns. */
  readonly cache?: string;
  readonly capacity?: 'insufficient';
  /** `unavailable` for audio without Web Audio. */
  readonly audio?: 'unavailable';
}

export async function openTestEntry(page: Page, options: TestEntryOptions = {}): Promise<void> {
  const query = new URLSearchParams(Object.entries(options).filter((entry): entry is [string, string] => entry[1] !== undefined));
  await page.goto(`/e2e/entries/app.html${query.size > 0 ? `?${query}` : ''}`);
}

/** P2-11 AC-01: no page text claims anything is playable or offers to play or start a mission. */
export async function expectNoPlayClaim(page: Page): Promise<void> {
  expect(await page.locator('body').innerText()).not.toMatch(/playable|play mission|start mission/i);
}

/** A file for the import page's file chooser. */
export interface FilePayload { readonly name: string; readonly mimeType: string; readonly buffer: Buffer }

/** The CloneCD files of a synthetic disc holding `covered`, whose names contain the file-name marker. */
export async function discFiles(covered: Parameters<typeof syntheticImport>[0]): Promise<FilePayload[]> {
  const { files } = await syntheticImport(covered);
  return Promise.all(files.map(async file => ({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(await file.arrayBuffer()) })));
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

import { expect, type Page } from '@playwright/test';
import type { ExpectedPackageProfile } from '../../src/workers/production-package.ts';

// The P2-11 development test entry: the production App with synthetic ports chosen by the page query (see
// src/app/app-entry.test-support.tsx). The development server alone serves it.

declare global {
  interface Window { osrTestEntry?: { readonly profile: ExpectedPackageProfile } }
}

export interface TestEntryOptions {
  /** The import Worker scenario, `production` or `missing`; `models` by default. */
  readonly worker?: string;
  readonly cache?: 'unavailable';
}

export async function openTestEntry(page: Page, options: TestEntryOptions = {}): Promise<void> {
  const query = new URLSearchParams(Object.entries(options).filter((entry): entry is [string, string] => entry[1] !== undefined));
  await page.goto(`/e2e/entries/app.html${query.size > 0 ? `?${query}` : ''}`);
}

/** P2-11 AC-01: no page text claims anything is playable or offers to play or start a mission. */
export async function expectNoPlayClaim(page: Page): Promise<void> {
  expect(await page.locator('body').innerText()).not.toMatch(/playable|play mission|start mission/i);
}

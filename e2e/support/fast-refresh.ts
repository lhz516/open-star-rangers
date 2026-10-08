import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

// Fast Refresh edits of the development server's own source (P2-11 subtask 13, P2-12 F-14). An edit appends one
// distinct comment to a module, so Vite pushes a hot update; the file is always restored afterwards, which is itself
// one more update. A replacement counts only within the same document: a full reload would replace it.

declare global {
  interface Window { osrRefreshDocument?: string }
}

/** Replaces `path`'s content in one rename, so a reader never sees a partial file. */
async function writeAtomically(path: string, content: string): Promise<void> {
  const temporary = `${path}.fast-refresh-e2e.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

/**
 * Runs `run` with an `edit(n)` that rewrites `file` with a distinct trailing comment, then restores the file and checks
 * it, whether or not `run` failed.
 */
export async function withEdits(file: string, run: (edit: (n: number) => Promise<void>) => Promise<void>): Promise<void> {
  const path = resolve(file);
  const original = await readFile(path, 'utf8');
  try {
    await run(n => writeAtomically(path, `${original}// Fast Refresh edit ${n} by an E2E test; the test restores this file.\n`));
  } finally {
    await writeAtomically(path, original);
    expect(await readFile(path, 'utf8'), `${file} is restored`).toBe(original);
  }
}

/** Marks the document, so a full reload, which would replace it, is told apart from a Fast Refresh. */
export async function markDocument(page: Page): Promise<string> {
  const mark = `document-${Date.now()}`;
  await page.evaluate(value => { window.osrRefreshDocument = value; }, mark);
  return mark;
}

/** The mark of the page's current document, which a full reload would have removed. */
export const documentMark = (page: Page): Promise<string | undefined> => page.evaluate(() => window.osrRefreshDocument);

/** The IDs of the viewer canvases still in the document. */
export const connectedCanvases = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().canvases.filter(({ connected }) => connected).map(({ id }) => id));

/** The viewer owner's serial number, which a new owner increases. */
export const viewerOwner = (page: Page) => page.getByTestId('viewer-view').getAttribute('data-owner');

/** The import page's job owner: the latest owner's serial number and how many owners are live. */
export async function jobOwners(page: Page) {
  const section = page.locator('section[data-job-owner]');
  return { serial: await section.getAttribute('data-job-owner'), live: await section.getAttribute('data-live-job-owners') };
}

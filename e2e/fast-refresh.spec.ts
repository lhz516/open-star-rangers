import type { Page } from '@playwright/test';
import { variantLabel } from '../src/ui/viewer/viewer-copy.ts';
import { button, openTestEntry, sliceFiles, smallFile } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test } from './support/browser-test.ts';
import { connectedCanvases, jobOwners, markDocument, viewerOwner, withEdits } from './support/fast-refresh.ts';
import { entryButton, firstEntry, openViewer, viewerDiagnostics, type ViewerDiagnostics } from './support/viewer-observations.ts';

// P2-11 subtask 13 (AC-16): StrictMode, Fast Refresh and round trips of the production App on the development test
// entry. The Fast Refresh cases edit a hook module of the dev server's own source, one distinct comment per edit, and
// always restore it. A replacement counts only with a new owner number and identity in the same document: a full
// reload, a re-render that keeps the owner, or an emptied screen does not.

test.describe.configure({ timeout: 180_000 });

const liveWorkers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers.filter(({ terminations }) => terminations === 0).map(({ id, name }) => ({ id, name })));
const allWorkers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers.map(({ id, terminations }) => ({ id, terminations })));
const started = (page: Page) => page.evaluate(() => window.osrAudioProbe.started());
const contexts = (page: Page) => page.evaluate(() => window.osrAudioProbe.contexts());

test('a Fast Refresh of the viewer owner hook replaces the owner three times, keeping the shell and the shown item (AC-16)', async ({ page }) => {
  await page.addInitScript(installAudioProbe);
  await openViewer(page, await sliceFiles());
  // StrictMode's first mount: one owner and one connected viewer canvas, and no audio context before a click.
  expect(await viewerOwner(page)).toBe('1');
  expect(await connectedCanvases(page)).toHaveLength(1);
  expect(await contexts(page)).toEqual([]);
  const model = await firstEntry('model');
  const variant = variantLabel(model.resolved.variants[1]);
  await entryButton(page, model.entry.id).click();
  await page.getByRole('radio', { name: variant, exact: true }).check();
  await button(page, 'Turn right').click();
  const shown = await viewerDiagnostics(page);
  const sound = page.getByTestId('viewer-sounds').getByRole('button', { name: /^Play / }).first();
  await sound.click();
  await expect.poll(() => contexts(page)).toEqual(['running']);
  const mark = await markDocument(page);

  await withEdits('src/app/composition/use-viewer-owner.ts', async edit => {
    for (let n = 1; n <= 3; n++) {
      const owner = Number(await viewerOwner(page));
      const [canvas] = await connectedCanvases(page);
      const audio = (await contexts(page)).length - 1;
      const sounds = await started(page);
      await edit(n);
      // A new owner made exactly one new canvas; the old canvas is disconnected and its context lost.
      await expect.poll(async () => {
        const connected = await connectedCanvases(page);
        return connected.length === 1 && connected[0] !== canvas;
      }, { timeout: 15_000, message: `edit ${n}: one connected canvas, not the old one` }).toBe(true);
      expect(Number(await viewerOwner(page)), `edit ${n}: a new owner`).toBe(owner + 1);
      expect(await page.evaluate(id => window.osrProbe.snapshot().canvases.find(entry => entry.id === id), canvas), `edit ${n}: the old canvas`)
        .toMatchObject({ connected: false, lost: true });
      expect(await page.evaluate(() => window.osrRefreshDocument), `edit ${n}: the same document`).toBe(mark);
      // The app shell kept its holder and the screen; the new owner shows the same item, variant and view.
      await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${model.entry.id}`);
      await expect(page.getByRole('radio', { name: variant, exact: true })).toBeChecked();
      let diagnostics: ViewerDiagnostics | undefined;
      await expect.poll(async () => (diagnostics = await viewerDiagnostics(page)).item).toBe(shown.item);
      expect(diagnostics!.view).toEqual(shown.view);
      // The old owner's audio context is closed; the new owner auditions with a new one.
      await expect.poll(async () => (await contexts(page))[audio], { message: `edit ${n}: the old audio context` }).toBe('closed');
      await sound.click();
      await expect.poll(() => started(page)).toBe(sounds + 1);
      const states = await contexts(page);
      expect(states, `edit ${n}: a new running context`).toHaveLength(audio + 2);
      expect(states.at(-1)).toBe('running');
    }
  });
});

test('a Fast Refresh of the import job hook replaces its owner three times, ending the running Worker, and a new job starts each time (AC-16)', async ({ page }) => {
  await openTestEntry(page, { worker: 'busy' });
  await expect(page.getByTestId('original-data-status')).not.toContainText('Checking');
  await button(page, 'Import original game data').click();
  // StrictMode's first mount: one live job owner.
  await expect.poll(() => jobOwners(page)).toEqual({ serial: expect.stringMatching(/^\d+$/), live: '1' });
  const files = ['a.ccd', 'a.img'].map(smallFile);
  const start = async () => {
    await page.locator('#import-files').setInputFiles(files);
    await button(page, 'Start import').click();
    await expect(button(page, 'Cancel import')).toBeEnabled();
  };
  await start();
  expect(await liveWorkers(page)).toEqual([expect.objectContaining({ name: 'busy' })]);
  const mark = await markDocument(page);

  await withEdits('src/app/import/use-import-job.ts', async edit => {
    for (let n = 1; n <= 3; n++) {
      const owner = await jobOwners(page);
      const [running] = await liveWorkers(page);
      await edit(n);
      await expect.poll(async () => (await allWorkers(page)).find(({ id }) => id === running.id)?.terminations, { timeout: 15_000 }).toBe(1);
      await expect.poll(() => jobOwners(page), { message: `edit ${n}: a new owner` }).toEqual({ serial: String(Number(owner.serial) + 1), live: '1' });
      expect(await page.evaluate(() => window.osrRefreshDocument), `edit ${n}: the same document`).toBe(mark);
      await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeVisible();
      await expect(button(page, 'Start import')).toBeEnabled();
      await start();
      expect(await liveWorkers(page), `edit ${n}: a new job`).toEqual([expect.objectContaining({ name: 'busy' })]);
    }
  });
  // Restoring the file is a fourth refresh: it ends the last job as well.
  await expect.poll(() => liveWorkers(page)).toEqual([]);
  await expect(button(page, 'Start import')).toBeEnabled();
});

test('three round trips through menu, import with a job, viewer and demo leave listeners, observers, Workers, canvases and frames at the baseline (AC-16)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  const state = () => page.evaluate(() => {
    const snapshot = window.osrProbe.snapshot();
    return {
      listeners: snapshot.listeners.filter(({ active, group }) => active && group !== 'test' && group !== 'vite').map(({ group, type }) => `${group}:${type}`).sort(),
      observers: snapshot.observers.filter(({ targets }) => targets.length > 0).length,
      workers: snapshot.workers.filter(({ terminations }) => terminations === 0).length,
      canvases: snapshot.canvases.filter(({ connected }) => connected).length,
      frames: snapshot.frames.pending,
    };
  });
  const baseline = await state();
  expect(baseline.workers).toBe(0);
  const image = (await firstEntry('image')).entry.id;
  for (let round = 1; round <= 3; round++) {
    // A job starts and the screen is left while it may still run; its Worker must be gone afterwards.
    const workersBefore = (await allWorkers(page)).length;
    await button(page, 'Import original game data').click();
    await page.locator('#import-files').setInputFiles([...await sliceFiles()]);
    await button(page, 'Start import').click();
    await expect.poll(async () => (await allWorkers(page)).length, { message: `round ${round}: a job Worker` }).toBe(workersBefore + 1);
    await button(page, 'Return to menu').click();
    await button(page, 'View resources').click();
    await entryButton(page, image).click();
    await expect.poll(async () => (await viewerDiagnostics(page)).item).toBe(`image ${image}`);
    await button(page, 'Return to menu').click();
    await button(page, 'Start synthetic demo').click();
    await expect(page.getByTestId('phase')).toHaveText('running');
    await button(page, 'Return to menu').click();
    await expect(button(page, 'Start synthetic demo')).toBeFocused();
    await expect.poll(state, { message: `round ${round}` }).toEqual(baseline);
  }
});

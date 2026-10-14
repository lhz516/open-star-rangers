import type { Page } from '@playwright/test';
import { variantLabel } from '../src/ui/viewer/viewer-copy.ts';
import { scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { button, filePayloads, importFiles, openTestEntry, sliceFiles, smallFile } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { tabTo } from './support/keyboard-input.ts';
import { expect, test } from './support/browser-test.ts';
import { connectedCanvases, documentMark, jobOwners, markDocument, viewerOwner, withEdits } from './support/fast-refresh.ts';
import {
  checkedWingman, chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, frameWindow, missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';
import { entryButton, firstEntry, openViewer, viewerDiagnostics, type ViewerDiagnostics } from './support/viewer-observations.ts';

// P2-11 subtask 13 (AC-16) and P3-04 subtask 11 (AC-09, AC-14): StrictMode, Fast Refresh and round trips of the
// production App on the development test entry. The Fast Refresh cases edit a module of the dev server's own source,
// one distinct comment per edit, and always restore it. A replacement counts only with a new owner number and identity
// in the same document: a full reload, a re-render that keeps the owner, or an emptied screen does not.

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

test('three round trips through menu, import with a job, viewer and mission leave listeners, observers, Workers, canvases, timers and frames at the baseline (AC-16, AC-14)', async ({ page }) => {
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
      timers: snapshot.timers.pending.length,
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
    // A mission run with the package's preselected wingman, left from the mission menu while it runs.
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    await fly(page);
    await tabTo(page, button(page, 'Mission menu'));
    await page.keyboard.press('Enter');
    await tabTo(page, button(page, 'Return to main menu'));
    await page.keyboard.press('Space');
    await expect(missionEntry(page)).toBeFocused();
    await expect.poll(state, { message: `round ${round}` }).toEqual(baseline);
  }
});

/** Imports the startable synthetic mission package on the test entry and returns to the menu, which holds it. */
async function importMission(page: Page): Promise<void> {
  await importFiles(page, await filePayloads([...await scenarioFiles('mission-startable')]), { worker: 'mission-startable' }, /Mission (?:loads|does not load) into Core/);
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Resources are held in this page.');
}

/** From the start page: starts with the checked wingman and ends the departure, until the run's tick advances. */
async function fly(page: Page): Promise<void> {
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.tick === 0);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page, 300);
}

/** The mission's resources the probes show over one window: lifecycle listeners, leave guards, timers and frames. */
async function missionResources(page: Page) {
  const snapshot = await frameWindow(page);
  return {
    session: snapshot.listeners.filter(entry => entry.active && entry.group === 'session').map(({ addedAt }) => addedAt),
    ...inputCapabilities(snapshot),
    leaveGuards: snapshot.listeners.filter(entry => entry.active && entry.type === 'beforeunload' && entry.group === 'other').length,
    timers: snapshot.timers,
    frames: snapshot.frames.maximum,
  };
}

function inputCapabilities(snapshot: Awaited<ReturnType<typeof frameWindow>>) {
  const active = (group: string) => snapshot.listeners.filter(entry => entry.active && entry.group === group).map(({ type }) => type).sort();
  return { keyboard: active('keyboard'), fullscreen: active('fullscreen'), pointerLock: active('pointer-lock') };
}

type InputCapabilities = ReturnType<typeof inputCapabilities>;

/** No mission resource is left: no session listener, leave guard, pending timer or game frame. */
function expectReleased(resources: Awaited<ReturnType<typeof missionResources>>, what: string): void {
  expect({
    ...resources, timers: resources.timers.pending, keyboard: resources.keyboard, fullscreen: resources.fullscreen, pointerLock: resources.pointerLock,
  }, what).toEqual({ session: [], keyboard: [], fullscreen: [], pointerLock: [], leaveGuards: 0, timers: [], frames: 0 });
}

/** The owner's keyboard, Fullscreen and Pointer Lock listeners are connected exactly once before any run. */
function expectInputCapabilities(capabilities: InputCapabilities, zoneBound: boolean, what: string): void {
  expect(capabilities.keyboard, `${what}: keyboard source`).toHaveLength(zoneBound ? 9 : 5);
  expect(capabilities.fullscreen, `${what}: Fullscreen port`).toEqual(['fullscreenchange', 'fullscreenerror']);
  expect(capabilities.pointerLock, `${what}: Pointer Lock port`).toHaveLength(5);
}

test('a Fast Refresh of the mission owner hook and of the mission screen replaces the owner, clearing its timer and keeping the package and the confirmed wingman (AC-09, AC-14)', async ({ page }, testInfo) => {
  await importMission(page);
  // `chooseWingman` checks its radio through Playwright's main-world script, whose own listeners come first.
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  let { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, 3);
  await fly(page);
  let flying = await missionResources(page);
  expectInputCapabilities(flying, true, 'the running input zone listeners');
  expect(flying).toMatchObject({ leaveGuards: 1, timers: { pending: [] }, frames: 1 });
  const mark = await markDocument(page);
  /** After a refresh: a new owner, one more than the last, at the introduction of the same document. */
  const newOwner = async (what: string) => {
    const frame = await waitForFrame(page, candidate => candidate.owner !== owner, 15_000);
    expect(frame, `${what}: a new owner at the introduction`).toEqual({ owner: owner! + 1, run: null, tick: null, position: 'intro' });
    owner = frame.owner;
    expect(await documentMark(page), `${what}: the same document`).toBe(mark);
  };
  for (const file of ['src/app/composition/use-mission-owner.ts', 'src/app/MissionScreen.tsx']) {
    // Refreshed in flight: the old owner's session listeners, run, leave guard and frame loop end with it.
    let introduction: number | undefined;
    await withEdits(file, async edit => {
      await edit(1);
      await newOwner(`${file} edited in flight`);
      const probe = await page.evaluate(() => window.osrProbe.snapshot());
      expectInputCapabilities(inputCapabilities(probe), false, `${file} edited`);
      const session = probe.listeners.filter(entry => entry.active && entry.group === 'session').map(({ addedAt }) => addedAt);
      expect(session, `${file} edited: one owner's session listeners`).toHaveLength(3);
      expect(Math.min(...session), `${file} edited: listeners of the new owner`).toBeGreaterThan(Math.max(...flying.session));
      expect(probe.listeners.filter(entry => entry.active && entry.type === 'beforeunload' && entry.group === 'other'), `${file} edited: no leave guard`).toEqual([]);
      expect(probe.frames.pending, `${file} edited: no game frame`).toBe(0);
      expect(probe.timers.pending, `${file} edited: the new introduction's timer`).toHaveLength(1);
      introduction = probe.timers.pending[0].id;
    });
    // Restoring the file refreshes the owner while its introduction timer is pending: the timer is cleared, not left to
    // fire, and the next owner holds only its own.
    await newOwner(`${file} restored at the introduction`);
    const resources = await missionResources(page);
    expectInputCapabilities(resources, false, `${file} restored`);
    expect(resources.timers.cleared, `${file} restored: the old introduction timer was cleared`).toContain(introduction);
    expect(resources.timers.fired, `${file} restored: the old introduction timer did not fire`).not.toContain(introduction);
    expect(resources.timers.pending, `${file} restored: only the new introduction's timer`).toHaveLength(1);
    expect(resources.timers.pending[0].id).not.toBe(introduction);
    expect(resources, `${file} restored: no leave guard or game frame`).toMatchObject({ leaveGuards: 0, frames: 0 });
    expect(resources.session).toHaveLength(3);
    // The package is still held, so the new owner can continue, and the start page preselects the confirmed wingman.
    await endPlaceholder(page, 'G-02/1', 'button');
    expect(await checkedWingman(page), `${file}: the confirmed wingman`).toBe(3);
    await fly(page);
    flying = await missionResources(page);
  }
  await tabTo(page, button(page, 'Mission menu'));
  await page.keyboard.press('Enter');
  await tabTo(page, button(page, 'Return to main menu'));
  await page.keyboard.press('Space');
  await expect(missionEntry(page)).toBeFocused();
  await balance.check('after the Fast Refreshes');
  await balance.attach();
});

test('a Fast Refresh of the app shell releases the running mission first, drops the package and returns to the menu (AC-09)', async ({ page }, testInfo) => {
  await importMission(page);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await fly(page);
  const mark = await markDocument(page);
  /** The shell's menu without the package, which the import saved, and with nothing of the mission left. */
  const atMenu = async (what: string) => {
    await expect(page.getByRole('heading', { name: 'Main menu', exact: true }), what).toBeVisible({ timeout: 15_000 });
    expect(await missionFrame(page), `${what}: no mission screen`).toBeNull();
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
    expect(await documentMark(page), `${what}: the same document`).toBe(mark);
    expectReleased(await missionResources(page), `${what}: the mission's resources`);
  };
  await withEdits('src/app/composition/use-resource-holder.ts', async edit => {
    await edit(1);
    await atMenu('shell edited');
  });
  await atMenu('shell restored');
  await balance.check('after the shell refreshes');
  // No cleanup failure was latched: the saved package restores and a new owner opens.
  await expect(page.getByTestId('cleanup-failure')).toHaveCount(0);
  await button(page, 'Open saved resources').click();
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible', { timeout: 30_000 });
  const reopened = await enterMission(page);
  expect(reopened.owner).toBeGreaterThan(owner!);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await balance.check('after a new mission visit');
  await balance.attach();
});

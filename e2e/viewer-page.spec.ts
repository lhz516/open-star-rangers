import { chromium, type Page } from '@playwright/test';
import { diagnoseMission } from '../src/app/resources/mission-diagnostics.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import { computeViewportLayout } from '../src/render/viewport/viewport-layout.ts';
import type { ViewerItem } from '../src/render/viewer/viewer-renderer.ts';
import { applyViewAction, INITIAL_VIEW, type ViewerView } from '../src/render/viewer/viewer-view.ts';
import { variantLabel } from '../src/ui/viewer/viewer-copy.ts';
import { productionCoveredFiles } from '../src/workers/synthetic-import.test-support.ts';
import { discFiles, expectNoPlayClaim, openTestEntry, sliceFiles } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test } from './support/browser-test.ts';
import { frameWindow } from './support/demo-observations.ts';
import { installedBrowser } from './support/environment.ts';
import { loadCacheModules, seedPackage } from './support/resource-cache.ts';
import {
  entryButton, expectSamples, firstEntry, maxDrawingBufferSize, modelsEntries, modelsPackage, openViewer, pictureOf, pictureSamples,
  solidSamples, viewerDiagnostics, type Sample, type ViewerDiagnostics,
} from './support/viewer-observations.ts';

// P2-11 subtask 11 (AC-10 to AC-15, AC-18, AC-24): the resource viewer of the production App on the development test
// entry, after importing the synthetic `models` scenario. Expected values come from the same package converted in Node.

test.describe.configure({ timeout: 120_000 });

declare global {
  interface Window { osrViewerContextTest?: WEBGL_lose_context }
}

/** The initial view turned `steps` steps down about the horizontal axis. */
const turned = (steps: number): ViewerView => applyViewAction(INITIAL_VIEW, { type: 'rotate', axis: 'horizontal', steps });
const midTone = (rgb: readonly number[]): boolean => rgb.some(channel => channel > 0 && channel < 255);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** Selects an entry, and a variant by its label, and waits until the renderer shows it. */
async function show(page: Page, id: string, variant?: string): Promise<ViewerDiagnostics> {
  await entryButton(page, id).click();
  if (variant !== undefined) await page.getByRole('radio', { name: variant, exact: true }).check();
  await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${id}`);
  const diagnostics = await viewerDiagnostics(page);
  expect(diagnostics.state).toBe('ready');
  expect(diagnostics.item).toMatch(new RegExp(` ${id.replace(/[/.-]/g, '\\$&')}$`));
  return diagnostics;
}

/** Draws the page's renderer made while `run` ran. */
async function drawsDuring(page: Page, run: () => Promise<void>): Promise<number> {
  const before = (await viewerDiagnostics(page)).draws;
  await run();
  return (await viewerDiagnostics(page)).draws - before;
}

/**
 * The mission section shows the structure and reference check that `diagnoseMission` gives in Node for the same
 * package: the counts, and every resolved model with whether the models group holds it.
 */
async function expectMissionSummary(page: Page): Promise<void> {
  const mission = diagnoseMission(await modelsPackage());
  if (mission.status !== 'loaded') throw new Error(`The synthetic mission did not load: ${mission.status}`);
  const { summary, references } = mission;
  const text = (await page.getByTestId('viewer-mission-summary').innerText()).replace(/\s+/g, ' ');
  for (const fact of [
    `Mission ${summary.mission}`, `campaign group ${summary.campaign.group}, slot ${summary.campaign.slot}`,
    `${summary.counts.declarations} declaration`, `player is declaration ${summary.player}`, `${summary.counts.spawnRegions} spawn region`,
    `${summary.counts.wingmanOptions} wingman option`, `${summary.sides.enemy} enemy`, `${summary.sides.friendly} friendly`,
    `${references.declarationsWithModel} declarations and ${references.wingmanOptionsWithModel} wingman options resolve to ${references.models.length} model`,
  ]) expect(text, fact).toContain(fact);
  expect(references.models.length).toBeGreaterThan(0);
  for (const { id, present } of references.models) expect(text).toContain(`Model ${id}: ${present ? 'present in' : 'missing from'} the models group`);
}

/** The sound Asset IDs of the package's audio group, in Asset ID order. */
async function soundIds(): Promise<string[]> {
  const audio = (await modelsPackage()).find(({ group }) => group === 'audio')!;
  return readGroupManifest(audio.manifest).assets.filter(({ kind }) => kind === 'sound').map(({ id }) => id).sort();
}

test('lists the package by kind and shows the mission structure the Node diagnosis gives (AC-10)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  const entries = await modelsEntries();
  expect(new Set(entries.map(({ entry }) => entry.kind))).toEqual(new Set(['model', 'effect', 'image', 'palette', 'layout', 'font']));
  for (const heading of ['Models', 'Effects', 'Images', 'Palettes', 'Layouts', 'Fonts']) {
    await expect(page.getByTestId('viewer-entries').getByRole('heading', { name: heading, exact: true })).toHaveCount(1);
  }
  await expect(page.getByTestId('viewer-entries').getByRole('button')).toHaveCount(entries.length);
  // Nothing is selected at first: an empty picture.
  await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', 'Resource viewer picture: nothing selected');
  await expect(page.getByTestId('viewer-entries').getByRole('button', { pressed: true })).toHaveCount(0);
  await expectMissionSummary(page);
  // The sounds are exactly the audio group's.
  await expect(page.getByTestId('viewer-sounds').getByRole('button', { name: /^Play / })).toHaveText((await soundIds()).map(() => 'Play'));
  expect(await page.getByTestId('viewer-sounds').getByRole('button', { name: /^Play / }).evaluateAll(buttons => buttons.map(element => element.getAttribute('aria-label'))))
    .toEqual((await soundIds()).map(id => `Play ${id}`));
  await expectNoPlayClaim(page);
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
});

test('shows why the mission of a package with placeholder logic does not load (AC-10)', async ({ page }) => {
  // The content test support's synthetic package, whose payloads are placeholders, seeded and restored.
  await openTestEntry(page);
  await expect(page.getByTestId('original-data-status')).not.toContainText('Checking');
  await loadCacheModules(page);
  expect(await seedPackage(page)).toBe('committed');
  // Listing again on the way back to the menu offers the seeded package.
  await button(page, 'Import original game data').click();
  await button(page, 'Return to menu').click();
  await button(page, 'Open saved resources').click();
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  const failure = page.getByTestId('viewer-mission-failure');
  await expect(failure).toHaveAttribute('data-category', /^mission\//);
  await failure.getByText('Technical details').click();
  await expect(failure).toContainText('Location');
  await expect(failure).toContainText('Reason');
  // Its items are placeholders too: each is marked failed with its code and location, and the others stay usable.
  const [first, second] = await page.getByTestId('viewer-entries').getByRole('button').all();
  await first.click();
  await expect(page.getByTestId('viewer-item-failure')).toContainText('Code');
  await second.click();
  await expect(page.getByTestId('viewer-item-failure')).toContainText('Location');
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
});

test('reads back every 2D kind byte for byte (AC-12)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  for (const kind of ['image', 'palette', 'font', 'layout'] as const) {
    const { entry, resolved } = await firstEntry(kind);
    const { layout, placement } = await show(page, entry.id);
    const samples = pictureSamples(pictureOf(resolved.item(0)!), placement!);
    // A glyph sheet is white, black and grid grey by convention; the other pictures carry palette colours.
    if (kind !== 'font') expect(samples.some(({ rgb }) => midTone(rgb)), `${kind} has a mid-tone sample`).toBe(true);
    await expectSamples(page, layout!, samples);
  }
});

test('reads back textured and untextured models and every effect kind byte for byte, and marks unmapped textures (AC-11, AC-13, AC-18)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  const { layout } = await viewerDiagnostics(page);
  const all = await modelsEntries();
  /** `turns` steps down about the horizontal axis show faces lying in a horizontal plane. */
  const cases: { readonly id: string; readonly item: ViewerItem; readonly variant: string; readonly unmapped: boolean; readonly turns: number; readonly samples: Sample[] }[] = [];
  // The first textured and the first untextured part list with stable samples; synthetic models are small or extreme.
  const wanted = new Set([true, false]);
  for (const { entry, resolved } of all.filter(({ entry: candidate }) => candidate.kind === 'model')) {
    resolved.variants.forEach((variant, index) => {
      if (variant.kind !== 'part-list' || variant.parts === 0 || wanted.size === 0) return;
      const item = resolved.item(index)!;
      const samples = solidSamples(item, layout!);
      if (samples.length > 0 && wanted.delete(samples.some(({ textured }) => textured))) {
        cases.push({ id: entry.id, item, variant: variantLabel(variant), unmapped: false, turns: 0, samples });
      }
    });
  }
  expect(wanted.size, 'a textured and an untextured model are found').toBe(0);
  for (const role of ['projectile', 'missile', 'debris']) {
    const { entry, resolved } = await firstEntry('effect', role);
    // The first view with stable samples that shows what the role needs: a mid-tone projectile colour, the missile's
    // untextured element in diagnostic grey, and a textured debris shape; head-on first, then turned down 45°.
    const found = [0, 3].flatMap(turns => resolved.variants.flatMap((variant, at) => {
      if (variant.kind !== 'effect-view' || (role === 'debris' && variant.label !== 'textured-shape')) return [];
      const samples = solidSamples(resolved.item(at)!, layout!, turned(turns));
      const shows = role === 'missile' ? samples.some(({ rgb }) => rgb.every(channel => channel === 128)) : samples.some(({ rgb }) => midTone(rgb));
      return shows ? [{ at, turns, samples }] : [];
    }))[0];
    expect(found, `a ${role} view to read back`).toBeDefined();
    cases.push({ id: entry.id, item: resolved.item(found.at)!, variant: variantLabel(resolved.variants[found.at]), unmapped: role !== 'projectile', ...found });
  }
  for (const { id, item, variant, unmapped, turns, samples } of cases) {
    await show(page, id, variant);
    for (let step = 0; step < turns; step++) await button(page, 'Turn down').click();
    expect((await viewerDiagnostics(page)).view).toEqual(turned(turns));
    expect(samples.some(({ rgb }) => midTone(rgb)), `${id} has a mid-tone sample`).toBe(true);
    if (item.kind === 'model') {
      // The colours of untextured samples are part colours as the content consumer gives them, independently of the renderer.
      const colours = item.parts.flatMap(({ material }) => ('texture' in material ? [] : [JSON.stringify(material.colour)]));
      for (const sample of samples.filter(({ textured }) => !textured)) expect(colours).toContain(JSON.stringify(sample.rgb));
    }
    await expectSamples(page, layout!, samples);
    if (item.kind === 'effect') await expect(page.getByTestId('viewer-texture-unmapped')).toHaveCount(unmapped ? 1 : 0);
    if (id.includes('missile')) expect(samples.some(({ rgb }) => rgb.every(channel => channel === 128)), 'the missile element is diagnostic grey').toBe(true);
    await button(page, 'Reset view').click();
  }
});

/**
 * Calls the viewer canvas's WEBGL_lose_context extension, as the browser does when it drops or restores the context.
 * A lost context hands out no extension, so the test keeps the one it took before the loss.
 */
const loseContext = (page: Page, action: 'loseContext' | 'restoreContext') => page.getByTestId('viewer-view').locator('canvas').evaluate((canvas, call) => {
  window.osrViewerContextTest ??= (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context') ?? undefined;
  if (!window.osrViewerContextTest) throw new Error('Missing WEBGL_lose_context');
  window.osrViewerContextTest[call]();
}, action);

test('draws once per change and never while idle, holds only the shown item, and releases on return (AC-14)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  expect((await frameWindow(page, 2000)).frames.requested).toBe(0);
  const all = await modelsEntries();
  const pick = (kind: string, count: number) => all.filter(({ entry }) => entry.kind === kind).slice(0, count).map(({ entry }) => entry.id);
  const ten = [...pick('model', 3), ...pick('effect', 2), ...pick('image', 2), ...pick('palette', 1), ...pick('font', 1), ...pick('layout', 1)];
  expect(ten).toHaveLength(10);
  for (const id of ten) expect(await drawsDuring(page, async () => { await show(page, id); }), `${id} drew once`).toBe(1);
  const switched = await viewerDiagnostics(page);
  expect((await frameWindow(page, 2000)).frames.requested).toBe(0);

  // On a 3D item, an interaction that changes the picture draws once; one that does not, never.
  const model = (await firstEntry('model')).entry.id;
  await show(page, model);
  const view = page.getByTestId('viewer-view');
  for (const [key, change] of [['ArrowRight', 1], ['0', 1], ['0', 0], ['Equal', 1], ['Minus', 1], ['0', 0]] as const) {
    expect(await drawsDuring(page, async () => { await view.focus(); await page.keyboard.press(key); }), `${key} draws ${change}`).toBe(change);
  }
  expect(await drawsDuring(page, async () => { await page.getByRole('checkbox', { name: /Neutral light/ }).check(); }), 'the light draws once').toBe(1);
  expect(await drawsDuring(page, async () => { await page.getByRole('checkbox', { name: /Neutral light/ }).uncheck(); }), 'the light draws once').toBe(1);
  expect(await drawsDuring(page, async () => { await page.getByRole('radio', { name: /^Part list 1:/ }).check(); }), 'a part list draws once').toBe(1);
  const missile = await firstEntry('effect', 'missile');
  await show(page, missile.entry.id);
  expect(await drawsDuring(page, async () => { await page.getByRole('radio', { name: 'Missile type 1', exact: true }).check(); }), 'a missile type draws once').toBe(1);
  expect(await drawsDuring(page, async () => { await page.getByRole('combobox', { name: /Texture rotation/ }).selectOption('7'); }), 'the texture rotation does not draw').toBe(0);
  expect((await viewerDiagnostics(page)).view.mappingRotation).toBe(7);

  // A context loss is shown; after the restore the same pixels are drawn again.
  await show(page, ten[5]);
  const { layout, placement } = await viewerDiagnostics(page);
  const samples = pictureSamples(pictureOf(all.find(({ entry }) => entry.id === ten[5])!.resolved.item(0)!), placement!);
  await expectSamples(page, layout!, samples);
  await loseContext(page, 'loseContext');
  await expect(page.getByTestId('viewer-render-status')).toContainText('The WebGL context was lost');
  await loseContext(page, 'restoreContext');
  await expect(page.getByTestId('viewer-render-status')).toHaveText('Picture ready.');
  await expectSamples(page, layout!, samples);

  // Leaving disconnects the canvas and loses its context; a fresh viewer showing only the last item holds as much.
  await show(page, ten[9]);
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  const canvases = await page.evaluate(() => window.osrProbe.snapshot().canvases);
  expect(canvases.length).toBeGreaterThan(0);
  expect(canvases.every(({ connected, lost }) => !connected && lost)).toBe(true);
  await button(page, 'View resources').click();
  await show(page, ten[9]);
  expect((await viewerDiagnostics(page)).gpu).toEqual(switched.gpu);
});

test('auditions a sound after a trusted click, stops it alone or with all, and closes the audio on return (AC-15)', async ({ page }) => {
  await page.addInitScript(installAudioProbe);
  await openViewer(page, await sliceFiles());
  const status = page.getByTestId('viewer-audio-status');
  await expect(status).not.toHaveText('Preparing audio…');
  expect(await page.evaluate(() => window.osrAudioProbe.contexts())).toEqual([]);
  const [first] = await soundIds();
  const routed = () => page.evaluate(() => window.osrAudioProbe.routed());
  await button(page, `Play ${first}`).click();
  await expect(status).toHaveAttribute('data-status', 'running');
  await expect.poll(routed).toBeGreaterThan(0);
  await button(page, `Stop ${first}`).click();
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await expect.poll(routed).toBe(0);
  await button(page, `Play ${first}`).click();
  await expect.poll(routed).toBeGreaterThan(0);
  await button(page, 'Stop all sounds').click();
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await expect.poll(routed).toBe(0);
  await button(page, 'Return to menu').click();
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.contexts())).toEqual(['closed']);
});

test('explains unavailable audio while the list and picture keep working (AC-15)', async ({ page }) => {
  await openViewer(page, await sliceFiles(), { audio: 'unavailable' });
  await button(page, `Play ${(await soundIds())[0]}`).click();
  await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'unavailable');
  await expect(page.getByTestId('viewer-audition-failure')).toContainText('audio-unavailable');
  await show(page, (await firstEntry('image')).entry.id);
});

test('lists only the complete groups of a partial package and says so', async ({ page }) => {
  // The graphics scenario converts no logic and no models.
  await openViewer(page, await discFiles(productionCoveredFiles()), { worker: 'graphics' });
  await expect(page.getByTestId('viewer-partial')).toContainText('only its complete groups are listed');
  await expect(page.getByTestId('viewer-partial')).toContainText('logic: missing; models: incomplete; cockpit-hud-map: complete; audio: complete');
  await expect(page.getByTestId('viewer-mission')).toContainText('The mission was not loaded');
  for (const heading of ['Models', 'Effects']) {
    await expect(page.getByTestId('viewer-entries').getByRole('heading', { name: heading, exact: true })).toHaveCount(0);
  }
  await expect(page.getByTestId('viewer-entries').getByRole('heading', { name: 'Layouts', exact: true })).toHaveCount(1);
});

/** Active keydown listeners outside the test tooling. */
const keyListeners = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().listeners
  .filter(({ active, type, group }) => active && type === 'keydown' && group !== 'test' && group !== 'vite').length);

test('controls answer the keyboard, keys turn and zoom only the focused picture, and its listener goes with the viewer (AC-24)', async ({ page }) => {
  await openViewer(page, await sliceFiles());
  const withViewer = await keyListeners(page);
  const model = (await firstEntry('model')).entry.id;
  // Enter and Space press the item buttons.
  for (const [id, key] of [[model, 'Enter'], [(await firstEntry('image')).entry.id, 'Space'], [model, 'Space']] as const) {
    await entryButton(page, id).focus();
    await page.keyboard.press(key);
    await expect(entryButton(page, id)).toHaveAttribute('aria-pressed', 'true');
  }
  // The variant, light and view controls answer Space and Enter.
  await page.getByRole('radio', { name: /^Part list 1:/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: /^Part list 1:/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Neutral light/ }).focus();
  await page.keyboard.press('Space');
  expect((await viewerDiagnostics(page)).view.lit).toBe(true);
  await button(page, 'Turn left').focus();
  await page.keyboard.press('Enter');
  expect((await viewerDiagnostics(page)).view.yaw).toBe(345);
  await button(page, 'Reset view').focus();
  await page.keyboard.press('Enter');

  // Tab reaches the picture, which shows a focus indicator and names the item.
  const view = page.getByTestId('viewer-view');
  for (let presses = 0; presses < 400 && !(await view.evaluate(element => element === document.activeElement)); presses++) await page.keyboard.press('Tab');
  await expect(view).toBeFocused();
  expect(await view.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await expect(view).toHaveAttribute('aria-label', `Resource viewer picture: ${model}`);
  const expectations: readonly (readonly [string, Partial<ViewerView>])[] = [
    ['ArrowRight', { yaw: 15 }], ['ArrowLeft', { yaw: 0 }], ['ArrowDown', { pitch: 15 }], ['ArrowUp', { pitch: 0 }],
    ['Shift+Equal', { zoom: 1.25 }], ['Minus', { zoom: 1 }], ['Equal', { zoom: 1.25 }], ['0', { zoom: 1 }],
  ];
  for (const [key, change] of expectations) {
    const before = await viewerDiagnostics(page);
    await view.focus();
    await page.keyboard.press(key);
    const after = await viewerDiagnostics(page);
    expect(after.view, key).toEqual({ ...before.view, ...change });
    expect(after.draws - before.draws, `${key} draws once`).toBe(1);
  }
  // With focus on a button, the same keys leave the picture alone.
  const before = await viewerDiagnostics(page);
  await button(page, 'Turn left').focus();
  for (const key of ['ArrowRight', 'Equal', 'Minus']) await page.keyboard.press(key);
  const after = await viewerDiagnostics(page);
  expect([after.view, after.draws]).toEqual([before.view, before.draws]);

  // In the same document: leaving removes the picture's listener, and opening the viewer again adds one.
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  expect(await keyListeners(page)).toBe(withViewer - 1);
  await button(page, 'View resources').click();
  // The listener is added once the new owner exists, after the page mounts.
  await expect.poll(() => keyListeners(page)).toBe(withViewer);
});

test('lays the picture out by the 4:3 rule in wide and narrow windows at two pixel ratios, with the same pixels (AC-24)', async ({ browser, baseURL }) => {
  const image = await firstEntry('image');
  const picture = pictureOf(image.resolved.item(0)!);
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor });
    try {
      const page = await context.newPage();
      await openViewer(page, await sliceFiles());
      await show(page, image.entry.id);
      const maximum = await maxDrawingBufferSize(page);
      for (const viewport of [{ width: 1280, height: 800 }, { width: 520, height: 900 }]) {
        await page.setViewportSize(viewport);
        const box = await page.getByTestId('viewer-view').evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
        const expected = computeViewportLayout({ ...box, devicePixelRatio: deviceScaleFactor, maxDrawingBufferSize: maximum });
        await expect.poll(async () => (await viewerDiagnostics(page)).layout).toEqual(expected);
        const { layout, placement } = await viewerDiagnostics(page);
        const canvas = await page.getByTestId('viewer-view').locator('canvas').evaluate(element => {
          const [outer, inner] = [element.parentElement!.getBoundingClientRect(), element.getBoundingClientRect()];
          return { left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width, height: inner.height };
        });
        expect(canvas).toEqual(layout!.frame);
        await expectSamples(page, layout!, pictureSamples(picture, placement!));
      }
    } finally {
      await context.close();
    }
  }
});

test('keeps the lists, the mission and the sounds in a browser without WebGL (AC-14)', async ({ baseURL }) => {
  const browser = await chromium.launch({ ...installedBrowser(), args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(installAudioProbe);
    await openViewer(page, await sliceFiles());
    expect(await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null)).toBe(true);
    await expect(page.getByTestId('viewer-render-status')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('viewer-render-status')).toContainText('WebGL 2 is unavailable');
    await expect(page.getByTestId('viewer-view').locator('canvas')).toHaveCount(0);
    await expect(page.getByTestId('viewer-entries').getByRole('button')).toHaveCount((await modelsEntries()).length);
    const image = (await firstEntry('image')).entry.id;
    await entryButton(page, image).click();
    await expect(entryButton(page, image)).toHaveAttribute('aria-pressed', 'true');
    await expectMissionSummary(page);
    await button(page, `Play ${(await soundIds())[0]}`).click();
    await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'running');
    await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed())).toBeGreaterThan(0);
  } finally {
    await browser.close();
  }
});

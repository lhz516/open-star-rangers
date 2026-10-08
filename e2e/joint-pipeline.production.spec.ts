import type { Page, TestInfo } from '@playwright/test';
import { diagnoseMission } from '../src/app/resources/mission-diagnostics.ts';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import { resolveEntry, viewerCatalog, type ResolvedEntry, type ViewerEntry } from '../src/app/viewer/viewer-items.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { readPayloadRecords } from '../src/content/payload.ts';
import { readSoundPayload } from '../src/content/sound-payload.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { CHECKER_GREYS } from '../src/render/viewer/viewer-presentation.ts';
import { applyViewAction, INITIAL_VIEW, type ViewerView } from '../src/render/viewer/viewer-view.ts';
import type { ViewportLayout } from '../src/render/viewport/viewport-layout.ts';
import { missionLines, variantLabel } from '../src/ui/viewer/viewer-copy.ts';
import { CANARY_TEXT } from '../src/workers/canary.test-support.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { button, expectNoPlayClaim, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import {
  canaryPackage, canaryProductionFiles, expectCacheArrival, expectInputArrival, expectPayloadArrival, productionCanaries,
} from './support/canaries.ts';
import { seedProductionCache, type SeededPackage } from './support/production-cache.ts';
import { expectedPackage, ResourceBalance, type ExpectedPackage } from './support/resource-balance.ts';
import {
  attachResponsiveness, describeResponsiveness, installResponsiveness, measureResponsiveness, type ResponsivenessRecord,
} from './support/responsiveness.ts';
import { entryButton, pictureOf, pictureSamples, solidSamples, viewerDiagnostics, type Sample, type ViewerDiagnostics } from './support/viewer-observations.ts';

// P2-12 subtask 07 (S-02, S-03, S-05, S-06; AC-03, AC-04, AC-05 and AC-10 for the production project): the joint
// pipeline on the local production preview under the proposed CSP, with the network audit on. The production whitelist
// matches SHA-256, so synthetic files only reach `source`/`unsupported-version` in the real `/assets/` Worker chunk
// (spec technical decision 1): these cases cover that rejection, the restore of a seeded synthetic cache, the viewer and
// audition, and same-origin reloads. They do not cover the success path of a production import; the development
// project's joint cases do, through the test entry.

test.describe.configure({ timeout: 300_000 });

const STATUS = 'original-data-status';
const NONE = 'Original game data: None in this browser.';
const SAVED = 'Original game data: Saved resources found in this browser, not yet verified.';
const HELD = 'Original game data: Resources are held in this page.';
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
const PRODUCTION_KEY = Object.freeze({
  originType: 'original-import', originToken: PRODUCTION_PACKAGE.sourceFingerprint, converterVersion: PRODUCTION_PACKAGE.converterVersion,
} as const);
/** One sound of each core role the spec auditions: fire, missile, explosion and Warp. */
const ROLES = ['fire-sound', 'missile-sound', 'explosion-sound', 'warp-sound'] as const;
/** Longer than every synthetic sound, so the audio probe returns every buffer the viewer made. */
const BUFFER_FRAMES = 4_096;

const statuses = (page: Page) => page.getByTestId('resource-statuses').locator('li');
/**
 * The texts of the items of the list with `testId`. Locator text reads such as `allTextContents()` start Playwright's
 * main-world script, whose window listeners would fail the resource balance; a page evaluation does not.
 */
const itemTexts = (page: Page, testId: string): Promise<string[]> =>
  page.evaluate(id => [...document.querySelectorAll(`[data-testid="${id}"] li`)].map(item => item.textContent ?? ''), testId);
const midTone = (rgb: readonly number[]): boolean => rgb.some(channel => channel > 0 && channel < 255);
const checkerGrey = (rgb: readonly number[]): boolean => CHECKER_GREYS.some(grey => rgb.every(channel => channel === grey));
const turned = (steps: number): ViewerView => applyViewAction(INITIAL_VIEW, { type: 'rotate', axis: 'horizontal', steps });

/** The samples of an AudioBuffer, as the audio probe's `buffers()` reports them. */
interface BufferSamples { readonly sampleRate: number; readonly length: number; readonly channels: number[][] }

declare global {
  interface Window { osrStartedBuffers?: BufferSamples[] }
}

/** Serialized before navigation: records the buffer of every source started, so each Play is tied to its own sound. */
function recordStartedBuffers(): void {
  const started: BufferSamples[] = [];
  window.osrStartedBuffers = started;
  const original = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>): void {
    const { buffer } = this;
    if (buffer) {
      started.push({
        sampleRate: buffer.sampleRate, length: buffer.length,
        channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => [...buffer.getChannelData(channel)]),
      });
    }
    original.apply(this, args);
  };
}

/** Records every `securitypolicyviolation` the document reports, before any page script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);

/** Installs the probes for every document, then opens the menu, sent with the proposed policy. */
async function openMenu(page: Page): Promise<void> {
  await recordViolations(page);
  await page.addInitScript(installAudioProbe);
  await page.addInitScript(recordStartedBuffers);
  await installResponsiveness(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId(STATUS)).toHaveText(NONE);
}

/** A shown item: its entry, the variant and turns to select, and its expected pixels for the shown diagnostics. */
interface ShownItem {
  readonly id: string;
  readonly variant: string | null;
  readonly turns: number;
  samples(diagnostics: ViewerDiagnostics): Sample[];
}

interface ExpectedSound {
  readonly id: string;
  readonly buffer: BufferSamples;
}

/**
 * A sound of the package as the AudioBuffer it must become, mapped here from the payload format independently of the
 * code under test (`soundChannelData`): u8 (v − 128) / 128, s16le v / 32768.
 */
function expectedSound(id: string, bytes: Uint8Array): ExpectedSound {
  const { sampleRate, channels, encoding, frames, pcm } = readSoundPayload(bytes);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const sample = (at: number): number => Math.fround(encoding === 'u8' ? (pcm[at] - 128) / 128 : view.getInt16(at * 2, true) / 32_768);
  return {
    id,
    buffer: { sampleRate, length: frames, channels: Array.from({ length: channels }, (_, channel) => Array.from({ length: frames }, (_, frame) => sample(frame * channels + channel))) },
  };
}

/** A 2D picture's grid samples, plus one opaque texel that is not a checkerboard grey, which sparse layouts need. */
function pictureWithOpaque(picture: ReturnType<typeof pictureOf>, placement: NonNullable<ViewerDiagnostics['placement']>): Sample[] {
  const samples = pictureSamples(picture, placement);
  const { width, height, rgba } = picture;
  const at = rgba.findIndex((alpha, index) => index % 4 === 3 && alpha === 255 && !checkerGrey([...rgba.subarray(index - 3, index)]));
  if (at < 3) throw new Error('The picture has no opaque texel outside the checkerboard greys');
  const texel = (at - 3) / 4;
  samples.push({
    x: Math.floor(placement.left + ((texel % width + 0.5) * placement.width) / width),
    y: Math.floor(placement.top + ((Math.floor(texel / width) + 0.5) * placement.height) / height),
    rgb: [rgba[at - 3], rgba[at - 2], rgba[at - 1]],
  });
  return samples;
}

/**
 * What the viewer must show for the seeded package, derived in Node from the same groups: the identity line, the
 * mission lines of `diagnoseMission`, one item of each of the six kinds with its pixels, and one sound of each core role.
 * The manifest identity hashes the whole identity basis and every payload identity, so the identity line stands for
 * the full content identity and the payload fingerprints.
 */
class ExpectedView {
  readonly identity: string;
  readonly mission: readonly string[];
  readonly sounds: readonly ExpectedSound[];
  readonly soundCount: number;
  /** The package's cache key and each group's Asset IDs, independently of the stored record. */
  readonly package: ExpectedPackage;
  /** The full identity and payload fingerprints the package record holds. */
  readonly stored: { readonly identity: unknown; readonly fingerprints: Readonly<Record<string, string>> };
  readonly #entries: readonly { readonly entry: ViewerEntry; readonly resolved: ResolvedEntry }[];
  #items: { readonly layout: ViewportLayout; readonly items: readonly ShownItem[] } | null = null;

  constructor(seeded: SeededPackage) {
    const held: HeldGroup[] = seeded.groups.map(group => ({ ...group, group: readGroupManifest(group.manifest).group }));
    const { identity } = seeded;
    this.identity = `Package identity: manifest ${identity.manifestIdentity}, converter ${identity.converterVersion}`;
    const lines = missionLines(diagnoseMission(held));
    if (lines === null) throw new Error('The seeded mission does not load');
    this.mission = lines;
    const { entries, payloads } = viewerCatalog(held);
    this.#entries = entries.map(entry => {
      const resolution = resolveEntry(entry, payloads);
      if (resolution.status !== 'resolved') throw new Error(`${entry.id} does not resolve: ${resolution.failure.code}`);
      return { entry, resolved: resolution.entry };
    });
    const audio = held.find(({ group }) => group === 'audio')!;
    const assets = readGroupManifest(audio.manifest).assets;
    const bytes = new Map(readPayloadRecords(audio.payloads).map(({ id, bytes: payload }) => [id, payload]));
    const sounds = assets.filter(({ kind }) => kind === 'sound');
    this.soundCount = sounds.length;
    this.sounds = ROLES.map(role => {
      const sound = sounds.find(asset => asset.role === role);
      if (!sound) throw new Error(`The package has no ${role}`);
      return expectedSound(sound.id, bytes.get(sound.id)!);
    });
    this.package = expectedPackage(PRODUCTION_KEY, seeded.groups);
    this.stored = {
      identity,
      fingerprints: Object.fromEntries(held.flatMap(({ manifest }) => readGroupManifest(manifest).assets.map(({ id, payloadIdentity }) => [id, payloadIdentity.fingerprint]))),
    };
  }

  /**
   * The six items, chosen once the viewer's layout is known; 3D pixels are computed here, 2D ones on first show. Every
   * later visit must have the same layout.
   */
  items(layout: ViewportLayout): readonly ShownItem[] {
    this.#items ??= { layout, items: [this.#model(layout), this.#effect(layout), ...(['image', 'palette', 'layout', 'font'] as const).map(kind => this.#picture(kind))] };
    expect(layout, 'the viewer layout of every visit').toEqual(this.#items.layout);
    return this.#items.items;
  }

  #first(kind: ViewerEntry['kind'], role?: string) {
    const found = this.#entries.find(({ entry }) => entry.kind === kind && (role === undefined || entry.role === role));
    if (!found) throw new Error(`The package has no ${kind} ${role ?? ''}`);
    return found;
  }

  #model(layout: ViewportLayout): ShownItem {
    const { entry, resolved } = this.#first('model', 'enemy-ship');
    const samples = solidSamples(resolved.item(0)!, layout);
    expect(samples.some(({ rgb }) => midTone(rgb)), `${entry.id} has a mid-tone sample`).toBe(true);
    return { id: entry.id, variant: variantLabel(resolved.variants[0]), turns: 0, samples: () => samples };
  }

  /** The first missile or textured debris view, turned 0 or 3 steps, with a textured mid-tone sample off every seam. */
  #effect(layout: ViewportLayout): ShownItem {
    for (const role of ['missile', 'debris']) {
      const { entry, resolved } = this.#first('effect', role);
      for (const turns of [0, 3]) {
        for (const [at, variant] of resolved.variants.entries()) {
          if (variant.kind !== 'effect-view' || (role === 'debris' && variant.label !== 'textured-shape')) continue;
          const samples = solidSamples(resolved.item(at)!, layout, turned(turns));
          if (samples.some(({ rgb, textured }) => textured && midTone(rgb))) return { id: entry.id, variant: variantLabel(variant), turns, samples: () => samples };
        }
      }
    }
    throw new Error('No effect view has a textured mid-tone sample off its seams');
  }

  #picture(kind: 'image' | 'palette' | 'layout' | 'font'): ShownItem {
    const { entry, resolved } = this.#first(kind);
    let samples: Sample[] | null = null;
    return {
      id: entry.id, variant: null, turns: 0,
      samples: ({ placement }) => {
        if (samples) return samples;
        samples = pictureWithOpaque(pictureOf(resolved.item(0)!), placement!);
        // A glyph sheet is white, black and grid grey; the other pictures carry palette colours.
        if (kind !== 'font') expect(samples.some(({ rgb }) => midTone(rgb)), `${entry.id} has a mid-tone sample`).toBe(true);
        return samples;
      },
    };
  }
}

/**
 * The bytes of drawing-buffer pixels as composited on the page, as `bufferPixels` reads them, but from a page screenshot
 * clipped to the picture area: an element screenshot, like `boundingBox()`, starts Playwright's main-world script, whose
 * window listeners stay in the document and would fail the resource balance.
 */
async function framePixels(page: Page, layout: ViewportLayout, points: readonly Sample[]): Promise<number[][]> {
  const clip = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="viewer-view"]')!;
    area.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const { left, top, width, height } = area.getBoundingClientRect();
    return { x: left, y: top, width, height };
  });
  const screenshot = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  return page.evaluate(async ({ png, origin, points: wanted }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), character => character.charCodeAt(0))], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screenshot decode requires a 2D context');
      context.drawImage(bitmap, 0, 0);
      return wanted.map(({ x, y }) => [...context.getImageData(origin.x + x, origin.y + y, 1, 1).data.slice(0, 3)]);
    } finally {
      bitmap.close();
    }
  }, {
    png: screenshot.toString('base64'),
    origin: { x: Math.round(layout.frame.left * layout.pixelRatio), y: Math.round(layout.frame.top * layout.pixelRatio) },
    points: points.map(({ x, y }) => ({ x, y })),
  });
}

/** What one viewer visit showed: the identity line, the mission lines and each item's pixels. */
interface Viewed {
  readonly identity: string;
  readonly mission: readonly string[];
  readonly pixels: Readonly<Record<string, readonly number[][]>>;
}

/**
 * From the menu: opens the viewer on the held package, checks its identity and mission against Node, shows the six
 * kinds with zero pixel error, auditions one sound of each core role (buffered samples, started sources, stopped), and
 * returns to the menu. Each item's warm GPU counts must equal its first in the same document.
 */
async function viewAndAudition(page: Page, balance: ResourceBalance, expected: ExpectedView): Promise<Viewed> {
  // The viewer builds every sound's AudioBuffer when it loads them, before the first Play.
  const before = await page.evaluate(frames => ({
    started: window.osrAudioProbe.started(), buffers: window.osrAudioProbe.buffers(frames).length, sources: window.osrStartedBuffers!.length,
  }), BUFFER_FRAMES);
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-identity')).toHaveText(expected.identity);
  await expect(page.getByTestId('viewer-mission-summary').locator('li')).toHaveText([...expected.mission]);
  const viewed = {
    ...await page.evaluate(() => ({
      identity: document.querySelector('[data-testid="viewer-identity"]')?.textContent ?? '',
      mission: [...document.querySelectorAll('[data-testid="viewer-mission-summary"] li')].map(item => item.textContent ?? ''),
    })),
    pixels: {} as Record<string, number[][]>,
  };
  const { layout } = await viewerDiagnostics(page);
  for (const item of expected.items(layout!)) {
    await entryButton(page, item.id).click();
    if (item.variant !== null) {
      // A click, not `check()`: Playwright's `check()` leaves its own window listeners, which the balance would report.
      const radio = page.getByRole('radio', { name: item.variant, exact: true });
      if (!(await radio.isChecked())) await radio.click();
      await expect(radio).toBeChecked();
    }
    for (let step = 0; step < item.turns; step++) await button(page, 'Turn down').click();
    await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${item.id}`);
    const diagnostics = await viewerDiagnostics(page);
    expect(diagnostics.state).toBe('ready');
    expect(diagnostics.view).toEqual(turned(item.turns));
    balance.warm(item.id, diagnostics.gpu);
    const samples = item.samples(diagnostics);
    expect(samples.some(({ rgb }) => !checkerGrey(rgb)), `${item.id} shows content, not only the transparency background`).toBe(true);
    const pixels = await framePixels(page, diagnostics.layout!, samples);
    expect(pixels, `${item.id}: ${JSON.stringify(samples)}`).toEqual(samples.map(({ rgb }) => [...rgb]));
    viewed.pixels[item.id] = pixels;
    if (item.turns > 0) await button(page, 'Reset view').click();
  }

  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  const list = page.getByTestId('viewer-sounds');
  await expect(list.getByRole('button', { name: /^Play / })).toHaveCount(expected.soundCount);
  const buffers = await page.evaluate(({ frames, from }) => window.osrAudioProbe.buffers(frames).slice(from), { frames: BUFFER_FRAMES, from: before.buffers });
  expect(buffers).toHaveLength(expected.soundCount);
  for (const { id, buffer } of expected.sounds) expect(buffers, `${id} is buffered sample for sample`).toContainEqual(buffer);
  for (const [index, { id, buffer }] of expected.sounds.entries()) {
    await list.getByRole('button', { name: `Play ${id}`, exact: true }).click();
    await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'running');
    // The synthetic sounds last milliseconds; the source start is the evidence, not a transient voice count. The started
    // source plays this sound's own samples, and once it ends its voice is released.
    await expect.poll(() => page.evaluate(() => window.osrAudioProbe.started())).toBe(before.started + index + 1);
    expect(await page.evaluate(at => window.osrStartedBuffers!.slice(at), before.sources + index), `Play ${id} starts its own samples`).toEqual([buffer]);
    await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed())).toBe(0);
  }
  await button(page, 'Stop all sounds').click();
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed())).toBe(0);

  await expectNoPlayClaim(page);
  const text = await page.locator('body').innerText();
  for (const marker of [MARKER, CANARY_TEXT]) expect(text).not.toContain(marker);
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  return viewed;
}

const workers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers);

/**
 * Imports the production-sized canary files: the real Worker chunk under `/assets/` reports `source`/`unsupported-version`
 * and is terminated once, in a measured window from the start to that end state; the page then returns to the menu.
 * The document had no Worker before.
 */
async function failIdentification(page: Page, files: readonly FilePayload[], records: ResponsivenessRecord[]): Promise<void> {
  expect(await workers(page)).toEqual([]);
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles([...files]);
  const failure = page.getByTestId('import-failure');
  records.push(await measureResponsiveness(page, 'identification', async () => {
    await button(page, 'Start import').click();
    await expect(failure).toHaveAttribute('data-category', 'source/version');
    await expect.poll(() => page.evaluate(() => window.osrProbe.snapshot().workers.map(({ terminations }) => terminations))).toEqual([1]);
  }));
  await expect(failure).toContainText('not a supported version of Star Rangers');
  await expect(failure.locator('dd').first()).toHaveText('source');
  await expect(failure.locator('dd').nth(1)).toHaveText('unsupported-version');
  // This job's result holds nothing: no status, group or save of its own.
  await expect(page.getByTestId('import-statuses')).toHaveCount(0);
  await expect(page.getByTestId('import-groups')).toHaveCount(0);
  const [worker] = await workers(page);
  expect(worker).toMatchObject({ entry: expect.stringMatching(/^\/assets\/import-worker-[\w-]+\.js$/), viteWorker: false, type: 'module', jobs: [1], posts: 1 });
  const steps = worker.messages.map(({ type, stage }) => (stage ? `${type}/${stage}` : type));
  expect(steps[0]).toBe('ready');
  expect(steps.at(-1)).toBe('failed');
  expect(steps).toContain('progress/identify-source');
  expect(worker.messages.slice(1).every(({ jobId }) => jobId === 1)).toBe(true);
  const text = await page.locator('body').innerText();
  for (const marker of [MARKER, CANARY_TEXT]) expect(text).not.toContain(marker);
  await button(page, 'Return to menu').click();
}

/**
 * Restores the saved package from the menu until it is verified and its mission loaded, in a measured window when
 * `records` is given.
 */
async function restore(page: Page, records: ResponsivenessRecord[] | null): Promise<void> {
  await expect(page.getByTestId(STATUS)).toHaveText(SAVED);
  const run = async (): Promise<void> => {
    await button(page, 'Open saved resources').click();
    await expect(button(page, 'View resources')).toBeFocused();
    await expect(statuses(page)).toHaveText(RESTORED);
  };
  if (records) records.push(await measureResponsiveness(page, 'restore', run));
  else await run();
  await expect(page.getByTestId(STATUS)).toHaveText(HELD);
}

/** Keeps the release evidence and the CSP record of the current document, reloads the same origin and takes the new baseline. */
async function reload(page: Page, balance: ResourceBalance, label: string): Promise<void> {
  expect(await violations(page), `${label}: CSP violations`).toEqual([]);
  await balance.beforeReload(label);
  const response = await page.reload();
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId(STATUS)).toHaveText(SAVED);
  await balance.rebaseline(`${label}: new document`);
}

/** The identity and payload fingerprints of every stored package record, read without the app's modules. */
const storedPackages = (page: Page) => page.evaluate(async ({ name, packageStore }) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error); };
  });
  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(packageStore, 'readonly').objectStore(packageStore).getAll();
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(request.error); };
    });
    type Manifest = { identity: unknown; assets: { id: string; payloadIdentity: { fingerprint: string } }[] };
    return records.map(record => {
      const manifests = (record as { groups: { manifest: Manifest }[] }).groups.map(({ manifest }) => manifest);
      return {
        identities: manifests.map(({ identity }) => identity),
        fingerprints: Object.fromEntries(manifests.flatMap(({ assets }) => assets.map(({ id, payloadIdentity }) => [id, payloadIdentity.fingerprint]))),
      };
    });
  } finally {
    db.close();
  }
}, RESOURCE_CACHE_DATABASE);

async function expectStored(page: Page, expected: ExpectedView): Promise<void> {
  const [stored, ...others] = await storedPackages(page);
  expect(others).toEqual([]);
  expect(new Set(stored.identities.map(identity => JSON.stringify(identity))).size).toBe(1);
  expect(stored.identities[0]).toEqual(expected.stored.identity);
  expect(stored.fingerprints).toEqual(expected.stored.fingerprints);
}

/**
 * Seeds the canary package once, under the production identity with `add`: the markers then cover the payload and cache
 * stages, and the input stage when the case imported `files`; each stage's arrival is proven before the audit relies on it.
 */
async function seedCanaryCache(page: Page, audit: Audit, files: readonly FilePayload[] | null, testInfo: TestInfo): Promise<ExpectedView> {
  const seeded = await seedProductionCache(page, await canaryPackage());
  const set = productionCanaries(seeded);
  audit.canaries(...set.markers.map(({ name, bytes }) => ({ name, value: bytes })));
  if (files) expectInputArrival(files, set);
  expectPayloadArrival(seeded.groups, set);
  await expectCacheArrival(page, set);
  await testInfo.attach('canary-arrival', {
    contentType: 'application/json',
    body: JSON.stringify(set.markers.map(({ name, stages }) => ({ name, stages })), null, 1),
  });
  const expected = new ExpectedView(seeded);
  await expectStored(page, expected);
  return expected;
}

/** Attaches the records and logs them; every window must have been measured with no long task. */
async function settleResponsiveness(testInfo: TestInfo, records: readonly ResponsivenessRecord[]): Promise<void> {
  await attachResponsiveness(testInfo, records);
  for (const record of records) console.info(`${testInfo.project.name} ${describeResponsiveness(record)}`);
  expect(records.map(({ operation, longTaskCount, longTasks }) => ({ operation, longTaskCount, longTasks })))
    .toEqual(records.map(({ operation }) => ({ operation, longTaskCount: 0, longTasks: [] })));
}

test('three rounds in one context: the real Worker chunk rejects synthetic files, and the once-seeded cache restores, renders, plays and survives same-origin reloads', async ({ page, audit }, testInfo) => {
  const files = await canaryProductionFiles();
  const records: ResponsivenessRecord[] = [];
  await openMenu(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });
  let expected: ExpectedView | null = null;
  try {
    for (let round = 1; round <= 3; round++) {
      audit.phase(`round ${round}`);
      // A held package is the one restored before: identification failing must leave it, its statuses and its record.
      const held = expected === null ? null : await itemTexts(page, 'resource-statuses');
      await failIdentification(page, files, records);
      await expect(page.getByTestId(STATUS)).toHaveText(held === null ? NONE : HELD);
      if (held === null) await expect(statuses(page)).toHaveCount(0);
      else await expect(statuses(page)).toHaveText(held);
      await balance.check(`round ${round}: identification failed`);

      if (expected === null) {
        expected = await seedCanaryCache(page, audit, files, testInfo);
        balance.expectPackages([expected.package]);
        await reload(page, balance, 'round 1: seeded');
        await restore(page, records);
        await balance.check('round 1: restored');
      }
      const before = await viewAndAudition(page, balance, expected);
      await balance.check(`round ${round}: viewed`);
      await reload(page, balance, `round ${round}: before reload`);
      await restore(page, records);
      await balance.check(`round ${round}: restored after reload`);
      const after = await viewAndAudition(page, balance, expected);
      await balance.check(`round ${round}: viewed after reload`);
      expect(after, `round ${round}: identity, mission and pixels after the reload`).toEqual(before);
    }
    await expectStored(page, expected!);
    expect(await violations(page)).toEqual([]);
  } finally {
    await balance.attach();
  }
  await settleResponsiveness(testInfo, records);
});

// AC-04's same-document round trips. The identification and restore windows of AC-05 are the three-round case's: its
// restores start seconds into the context. Restored within a second or two of a new context, the restore click's task
// waited 25–110 ms inside Chrome before dispatching the click, with about 3 ms of main-thread CPU (CDP trace), and
// not after the context had idled 4 s; that browser wait is not a restore measurement, so this case leaves it unmeasured.
test('three viewer round trips after one cached restore in the same document keep warm GPU counts equal and release every owned resource', async ({ page, audit }, testInfo) => {
  await openMenu(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });
  try {
    const expected = await seedCanaryCache(page, audit, null, testInfo);
    balance.expectPackages([expected.package]);
    await reload(page, balance, 'seeded');
    await restore(page, null);
    await balance.check('restored');
    for (let round = 1; round <= 3; round++) {
      await viewAndAudition(page, balance, expected);
      const { snapshot } = await balance.check(`viewer round ${round}`);
      // Every viewer's canvas left the document with its context lost and every AudioContext closed; no Worker started.
      expect(snapshot.audio?.contexts.map(({ state, closes }) => [state, closes])).toEqual(Array(round).fill(['closed', ['resolved']]));
      expect(snapshot.probe.canvases.map(({ connected, lost }) => [connected, lost])).toEqual(Array(round).fill([false, true]));
      expect(snapshot.probe.workers).toEqual([]);
    }
    expect(await violations(page)).toEqual([]);
  } finally {
    await balance.attach();
  }
});

import type { Page } from '@playwright/test';
import { consoleText, test, expect } from './support/browser-test.ts';
import type * as OwnerModule from '../src/app/import/import-job-owner.ts';
import type { ImportJobOwner, ImportJobSnapshot } from '../src/app/import/import-job-owner.ts';
import type * as FactoryModule from '../src/platform/workers/browser-import-worker.ts';
import type * as SyntheticImportModule from '../src/workers/synthetic-import.test-support.ts';
import { PRODUCTION_CATALOG } from '../src/original-data/source/source-catalog.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import { CONTENT_SCHEMA_VERSION, readContentIdentityBasis } from '../src/content/content-identity.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { deriveManifestIdentity, type GroupDraft } from '../src/content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { PRODUCTION_SOUND_USAGE } from '../src/original-data/conversion/production-sounds.test-support.ts';
import {
  AUDIO_CONVERSION_USAGE, audioCoveredFiles, GRAPHICS_CONVERSION_USAGE, PRODUCTION_CONVERSION_USAGE, sliceCoveredFiles, syntheticImport, syntheticSource,
} from '../src/workers/synthetic-import.test-support.ts';
import { PRODUCTION_EFFECT_USAGE } from '../src/original-data/conversion/production-effects.test-support.ts';
import { PRODUCTION_MODEL_USAGE } from '../src/original-data/conversion/production-models.test-support.ts';
import { COCKPIT_HUD_MAP_USAGE, MODEL_TEXTURE_USAGE } from '../src/original-data/conversion/production-graphics.test-support.ts';
import { createImportJob } from '../src/workers/import-job.ts';
import type { BudgetRecord } from '../src/content/budget.ts';
import { validateGroup, type GroupInput } from '../src/content/completeness.ts';
import { runGraphicsStep, stepGroupDraft } from '../src/original-data/conversion/graphics-step.ts';
import { modelsGroupDraft } from '../src/original-data/conversion/model-step.ts';
import {
  PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE,
} from '../src/original-data/conversion/production-graphics.ts';

// P2-04 AC-08 to AC-10: real module Workers in Chromium, loaded through the platform adapter by the app's job owner.
// The page imports modules from the development server, so this spec runs in the development project only. Every file
// name contains MARKER, and every failing test scenario throws text that contains it too.

/** `production` is the real entry, `missing` an entry URL that does not exist, and any other value a test scenario. */
type Entry = 'production' | 'missing' | 'synthetic' | 'graphics' | 'graphics-corrupt' | 'graphics-element-corrupt' | 'audio' | 'models' | 'models-corrupt'
  | 'busy' | 'job-throws'
  | 'late-error' | 'top-level-throw';

/**
 * The synthetic files to import: uncovered, the production-sized whitelist, the production graphics structure (with a
 * short font table or a rejected cockpit element in the corrupt variants), that with sounds, or the slice disc every
 * production step converts, with a broken shared mesh in the corrupt variant.
 */
type Covered = 'none' | 'production-sized' | 'graphics' | 'graphics-corrupt' | 'graphics-element-corrupt' | 'audio' | 'slice' | 'slice-corrupt';

interface LogEntry {
  readonly event: 'snapshot' | 'click' | 'frame' | 'cancel' | 'dispose';
  readonly at: number;
  readonly snapshot?: ImportJobSnapshot;
  readonly trusted?: boolean;
  readonly accepted?: boolean;
}

interface Harness {
  owner: ImportJobOwner | null;
  files: File[];
  covered: [string, number][];
  entry: Entry;
  /** When set, the owner subscriber cancels the job at its first running snapshot in this stage. */
  cancelAtStage: string | null;
  /** Every group message the owner received, in order, with its manifest; the owner summarises an incomplete group by status only. */
  readonly received: { group: string; manifest: unknown }[];
  readonly graphicsPayloadBytes: number;
  readonly log: LogEntry[];
  record(entry: Omit<LogEntry, 'at'>): void;
  prepare(covered: Covered): Promise<void>;
  createOwner(): void;
  compareTaken(): { group: string; payloads: number; matches: boolean }[] | null;
  startFrames(): void;
}

declare global {
  interface Window { osrImport: Harness }
}

/** Opens the app and installs the page-side harness: an owner whose Worker factory follows `entry`, and an event log. */
async function openHarness(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    const load = <Module>(path: string): Promise<Module> => import(path) as Promise<Module>;
    const { createImportJobOwner } = await load<typeof OwnerModule>('/src/app/import/import-job-owner.ts');
    const { browserImportWorkerFactory } = await load<typeof FactoryModule>('/src/platform/workers/browser-import-worker.ts');
    const support = await load<typeof SyntheticImportModule>('/src/workers/synthetic-import.test-support.ts');
    const startedAt = performance.now();
    const harness: Harness = {
      owner: null, files: [], covered: [], entry: 'production', cancelAtStage: null, received: [], graphicsPayloadBytes: support.GRAPHICS_PAYLOAD_BYTES,
      log: [],
      record: entry => { harness.log.push({ ...entry, at: performance.now() - startedAt }); },
      prepare: async covered => {
        // The production whitelist covers none of these files; the test entry's synthetic whitelist covers all of them.
        const contents = covered === 'none' ? { 'MAIN/OTHER.DAT': support.generatedContent(4096, 7) }
          : covered === 'production-sized' ? support.productionSizedFiles()
            : covered === 'audio' ? support.audioCoveredFiles()
              : covered === 'slice' || covered === 'slice-corrupt' ? support.sliceCoveredFiles({ corruptMesh: covered === 'slice-corrupt' })
                : support.productionCoveredFiles(({ 'graphics-corrupt': 'font', 'graphics-element-corrupt': 'element' } as Partial<Record<Covered, 'font' | 'element'>>)[covered]);
        harness.covered = Object.entries(contents).map(([path, content]) => [path, content instanceof Uint8Array ? content.length : content.byteLength]);
        harness.files = [...(await support.syntheticImport(contents)).files];
      },
      createOwner: () => {
        const createWorker = () => {
          if (harness.entry === 'missing') return new Worker(new URL('/src/workers/missing-import-worker.ts', location.href), { type: 'module' });
          return new Worker(new URL('/src/workers/import-worker.test-support.ts', location.href), { type: 'module', name: harness.entry });
        };
        const factory = harness.entry === 'production' ? browserImportWorkerFactory() : browserImportWorkerFactory(createWorker);
        const owner = createImportJobOwner({
          createPort: events => factory({
            ...events,
            message: data => {
              const message = data as { type?: unknown; group?: string; input?: { manifest: unknown } } | null;
              if (message?.type === 'group') harness.received.push({ group: message.group!, manifest: message.input!.manifest });
              events.message(data);
            },
          }),
          reportError: error => { throw error; },
        });
        owner.subscribe(() => {
          const snapshot = owner.getSnapshot();
          harness.record({ event: 'snapshot', snapshot });
          if (snapshot.status === 'running' && snapshot.stage !== null && snapshot.stage === harness.cancelAtStage) {
            harness.cancelAtStage = null;
            harness.record({ event: 'cancel', accepted: owner.cancel() });
          }
        });
        harness.owner = owner;
      },
      compareTaken: () => {
        const final = harness.owner!.getSnapshot();
        const groups = harness.owner!.takeGroups();
        if (!groups || final.status !== 'finished') return null;
        const expected = support.boundGroups(final.identity.sourceFingerprint);
        const same = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
        return groups.map((item, index) => {
          const payloads = item.payloads as { bytes: Uint8Array }[];
          const reference = expected[index][1].payloads as { bytes: Uint8Array }[];
          return {
            group: item.group, payloads: payloads.length,
            matches: item.group === expected[index][0] && payloads.length === reference.length && payloads.every((payload, at) => same(payload.bytes, reference[at].bytes)),
          };
        });
      },
      startFrames: () => {
        const frame = () => { harness.record({ event: 'frame' }); requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      },
    };
    window.osrImport = harness;
  });
}

/** Prepares files, creates the owner for `entry` and starts a job. */
async function startImport(page: Page, entry: Entry, covered: Covered = 'none'): Promise<void> {
  await page.evaluate(async ({ entry, covered }) => {
    const harness = window.osrImport;
    harness.entry = entry;
    await harness.prepare(covered);
    if (!harness.owner) harness.createOwner();
    harness.owner!.start([...harness.files]);
  }, { entry, covered });
}

const TERMINAL = ['finished', 'failed', 'cancelled'];
const settled = (page: Page) => page.waitForFunction(terminal => terminal.includes(window.osrImport.owner!.getSnapshot().status), TERMINAL);
const snapshots = (page: Page) => page.evaluate(() => window.osrImport.log.flatMap(entry => (entry.snapshot ? [entry.snapshot] : [])));
const probe = (page: Page) => page.evaluate(() => {
  const snapshot = window.osrProbe.snapshot();
  return {
    workers: snapshot.workers.map(({ entry, viteWorker, type, name, posts, terminations }) => ({ entry, viteWorker, type, name, posts, terminations })),
    activeListeners: snapshot.listeners.filter(listener => listener.group === 'worker' && listener.active).length,
    listeners: snapshot.listeners.filter(listener => listener.group === 'worker').length,
  };
});
/** Waits for `count` frames after the last logged event of type `after`, so later notifications would have been seen. */
const framesAfter = (page: Page, after: LogEntry['event'], count = 3) => page.waitForFunction(({ after, count }) => {
  const { log } = window.osrImport;
  const index = log.findLastIndex(entry => entry.event === after);
  return index >= 0 && log.slice(index + 1).filter(entry => entry.event === 'frame').length >= count;
}, { after, count });

/** Each change of the running snapshot as its stage and whether the source is identified, or the status otherwise. */
function distinctSteps(observed: readonly ImportJobSnapshot[]): string[] {
  const steps = observed.map(snapshot => (snapshot.status === 'running'
    ? `running:${snapshot.stage}:${snapshot.identity ? 'identified' : '-'}` : snapshot.status));
  return steps.filter((step, index) => step !== steps[index - 1]);
}


test('production entry reads the synthetic disc in one module Worker and reports the unsupported version', async ({ page }, testInfo) => {
  await openHarness(page);
  await startImport(page, 'production');
  await settled(page);
  const observed = await snapshots(page);
  expect(await probe(page)).toEqual({
    // Built by Vite's Worker transform from the default factory; the owner sent exactly one start message.
    workers: [{ entry: '/src/workers/import-worker.ts', viteWorker: true, type: 'module', name: '', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(observed.some(snapshot => snapshot.status === 'running' && snapshot.stage === 'identify-source' && snapshot.readBytes > 0)).toBe(true);
  expect(observed.at(-1)).toMatchObject({
    status: 'failed', jobId: 1, stage: 'identify-source',
    error: { layer: 'source', code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB', limit: null },
  });
  const reads = observed.flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  const log = await page.evaluate(() => window.osrImport.log.filter(entry => entry.snapshot).map(entry => [entry.snapshot!.status, entry.at] as const));
  const sent = log.find(([status]) => status === 'running')!;
  testInfo.annotations.push({
    type: 'observation',
    description: `production entry: ${reads.at(-1)} bytes read, failed ${Math.round(log.at(-1)![1] - sent[1])} ms after start was sent`,
  });
});

test('test entry identifies production-sized synthetic files and transfers four complete groups', async ({ page }, testInfo) => {
  await openHarness(page);
  await startImport(page, 'synthetic', 'production-sized');
  await settled(page);
  // The generated disc holds the eight whitelisted paths at their production sizes, checked against the catalog itself.
  const covered = await page.evaluate(() => window.osrImport.covered);
  expect(covered.sort()).toEqual(PRODUCTION_CATALOG.files.map(({ path, byteLength }) => [path, byteLength]).sort());
  expect(covered).toHaveLength(8);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'synthetic', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  const observed = await snapshots(page);
  const final = observed.at(-1)!;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  expect(final.identity.versionId).toBe('synthetic-browser');
  expect(final.groups.map(({ group, status, diagnostics }) => [group, status, diagnostics.length]))
    .toEqual(['logic', 'models', 'cockpit-hud-map', 'audio'].map(group => [group, 'group-complete', 0]));
  // In order: identification, the starts of the (empty) graphics, logic, audio and model stages, then one more complete group per
  // change, then the end; the job itself throws if a payload it sent was not detached, so finishing proves every group
  // was transferred.
  const identifiedAt = observed.findIndex(snapshot => 'identity' in snapshot && snapshot.identity !== null);
  expect(identifiedAt).toBeGreaterThan(0);
  expect(observed.slice(identifiedAt).map(snapshot =>
    `${snapshot.status}:${'stage' in snapshot ? snapshot.stage : '-'}:${'groups' in snapshot ? snapshot.groups.length : '-'}`))
    .toEqual([
      'running:identify-source:0', 'running:convert-graphics:0', 'running:convert-logic:0', 'running:convert-audio:0', 'running:convert-models:0',
      'running:convert-models:1', 'running:convert-models:2', 'running:convert-models:3', 'running:convert-models:4', 'finished:-:4',
    ]);
  expect(await page.evaluate(() => window.osrImport.compareTaken()))
    .toEqual(final.groups.map(({ group }) => ({ group, payloads: expect.any(Number), matches: true })));
  const reads = observed.slice(0, identifiedAt).flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads.at(-1)).toBe(final.usage.sourceReadBytes);
  const log = await page.evaluate(() => window.osrImport.log.filter(entry => entry.snapshot).map(entry => entry.at));
  const sentAt = log[observed.findIndex(snapshot => snapshot.status === 'running')];
  testInfo.annotations.push({
    type: 'observation',
    description: `test entry: identified ${final.usage.sourceReadBytes} bytes read in ${Math.round(log[identifiedAt] - sentAt)} ms after start was sent`,
  });
});

// P2-05 AC-12: the production job with its graphics stage, on a synthetic disc in the production structure; the disc
// also holds synthetic samples at the production sound entries, so the audio stage sends the complete audio group.
test('test entry converts the production graphics and sounds after identification and finishes with the cockpit-hud-map and audio groups', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await startImport(page, 'graphics', 'graphics');
  await settled(page);
  const observed = await snapshots(page);
  const final = observed.at(-1)!;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  // Identification progress, `identified`, graphics progress, the start of the (empty) logic stage, audio progress, the
  // start of the model stage, which has no model to convert, then the end: each change of the running snapshot in order.
  expect(distinctSteps(observed)).toEqual([
    'starting', 'running:null:-', 'running:identify-source:-', 'running:identify-source:identified', 'running:convert-graphics:identified',
    'running:convert-logic:identified', 'running:convert-audio:identified', 'running:convert-models:identified', 'finished',
  ]);
  expect(final.groups.map(({ group, status }) => [group, status])).toEqual([['models', 'incomplete'], ['cockpit-hud-map', 'group-complete'], ['audio', 'group-complete']]);
  expect(final.groups[1]).toEqual({ group: 'cockpit-hud-map', status: 'group-complete', assets: 4 + COCKPIT_HUD_MAP_USAGE.assets, diagnostics: [] });
  expect(final.groups[2]).toEqual({ group: 'audio', status: 'group-complete', assets: PRODUCTION_SOUND_USAGE.assets, diagnostics: [] });
  expect(final.usage).toEqual({ ...PRODUCTION_CONVERSION_USAGE, sourceReadBytes: final.usage.sourceReadBytes });
  const reads = observed.flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  expect(reads.at(-1)).toBe(final.usage.sourceReadBytes);
  expect(await page.evaluate(() => window.osrImport.owner!.takeGroups()?.map(({ group }) => group))).toEqual(['cockpit-hud-map', 'audio']);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'graphics', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(JSON.stringify(observed)).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

// P2-08 AC-08: the production job with the synthetic sound table, the same scenario as the Node pipeline test.
test('test entry converts the synthetic sounds after the graphics and hands over one complete audio group', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await startImport(page, 'audio', 'audio');
  await settled(page);
  const observed = await snapshots(page);
  const final = observed.at(-1)!;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  expect(distinctSteps(observed)).toEqual([
    'starting', 'running:null:-', 'running:identify-source:-', 'running:identify-source:identified', 'running:convert-graphics:identified',
    'running:convert-logic:identified', 'running:convert-audio:identified', 'running:convert-models:identified', 'finished',
  ]);
  expect(final.groups.map(({ group, status }) => [group, status])).toEqual([['models', 'incomplete'], ['cockpit-hud-map', 'group-complete'], ['audio', 'group-complete']]);
  expect(final.groups[2]).toEqual({ group: 'audio', status: 'group-complete', assets: 4, diagnostics: [] });
  const graphicsPayloadBytes = await page.evaluate(() => window.osrImport.graphicsPayloadBytes);
  expect(final.usage).toMatchObject({
    assets: GRAPHICS_CONVERSION_USAGE.assets + 4, dependencyEdges: GRAPHICS_CONVERSION_USAGE.dependencyEdges,
    paletteEntries: GRAPHICS_CONVERSION_USAGE.paletteEntries, glyphs: GRAPHICS_CONVERSION_USAGE.glyphs, imagePixels: GRAPHICS_CONVERSION_USAGE.imagePixels,
    payloadBytes: graphicsPayloadBytes + AUDIO_CONVERSION_USAGE.payloadBytes, audioSamples: AUDIO_CONVERSION_USAGE.audioSamples,
  });
  const reads = observed.flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  expect(reads.at(-1)).toBe(final.usage.sourceReadBytes);
  const taken = await page.evaluate(() => window.osrImport.owner!.takeGroups()!.map(({ group, manifest, payloads, sources }) => ({
    group, manifest, sources, payloadBytes: (payloads as { bytes: Uint8Array }[]).map(({ bytes }) => bytes.byteLength),
  })));
  expect(taken.map(({ group }) => group)).toEqual(['cockpit-hud-map', 'audio']);
  const [, { sources, payloadBytes }] = taken;
  const manifest = readGroupManifest(taken[1].manifest);
  expect(payloadBytes).toEqual(manifest.assets.map(({ payloadIdentity }) => payloadIdentity.byteLength));
  // The Worker's package identity equals the one Node derives from the same audio manifest and source states and the
  // graphics groups Node converts from the same disc: the cockpit-hud-map partition, and the models partition alone, as
  // no craft model is bound.
  const basis = readContentIdentityBasis({
    schemaVersion: CONTENT_SCHEMA_VERSION, sliceId: CLASSIC_P2_SLICE.sliceId, sliceDefinitionVersion: CLASSIC_P2_SLICE.version,
    converterVersion: 'osr-import.graphics-2.logic-1.audio-1.models-3', origin: { type: 'original-import', sourceFingerprint: final.identity.sourceFingerprint },
  });
  const source = await syntheticSource(audioCoveredFiles(), 'synthetic-audio');
  expect(source.identity.fingerprint).toBe(final.identity.sourceFingerprint);
  const graphics = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
  const models = modelsGroupDraft([graphics], source.identity.fingerprint);
  const cockpit = stepGroupDraft('cockpit-hud-map', [graphics], source.identity.fingerprint);
  expect(manifest.identity).toEqual({
    ...basis,
    manifestIdentity: deriveManifestIdentity(basis, [
      { ...models, payloads: [] }, { ...cockpit, payloads: [] }, { group: 'audio', assets: manifest.assets, payloads: [], sources } as GroupDraft,
    ]),
  });
  expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([['audio', 1, 1]]);
  expect(JSON.stringify(observed)).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

// P2-05 AC-12 and P2-07 AC-09: a font table or a front cockpit element the converter rejects fails the graphics stage
// before any group is sent.
test.describe('test entry fails corrupt synthetic graphics at the source layer without a group', () => {
  for (const [corrupted, entry, location] of [
    ['font', 'graphics-corrupt', 'graphics[font/hud/4x6].glyphs'],
    ['cockpit element', 'graphics-element-corrupt', 'graphics[layout/cockpit/front].elements'],
  ] as const) {
    test(`a corrupt ${corrupted}`, async ({ page }) => {
      const consoled = consoleText(page);
      await openHarness(page);
      await startImport(page, entry, entry);
      await settled(page);
      const observed = await snapshots(page);
      expect(observed.at(-1)).toEqual({
        status: 'failed', jobId: 1, stage: 'convert-graphics',
        error: { layer: 'source', code: 'invalid-payload', location, reason: expect.any(String), limit: null },
      });
      expect(await page.evaluate(() => window.osrImport.received.length)).toBe(0);
      expect(await page.evaluate(() => window.osrImport.owner!.takeGroups())).toBeNull();
      expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([[entry, 1, 1]]);
      expect(JSON.stringify(observed)).not.toContain(MARKER);
      expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
    });
  }
});

/** The production job on the slice disc run in Node with the same test support: the groups it sends and its usage. */
async function nodeSliceRun(): Promise<{ readonly groups: ReadonlyMap<string, GroupInput>; readonly usage: BudgetRecord }> {
  const imported = await syntheticImport(sliceCoveredFiles(), 'synthetic-models');
  const groups = new Map<string, GroupInput>();
  const usage = await createImportJob(imported.open)(imported.files.map(file => ({ name: file.name, blob: file })), {
    progress: () => undefined, identified: () => undefined, group: (group, input) => { groups.set(group, input); },
  });
  return { groups, usage };
}

// P2-06 AC-10, AC-14 and AC-20: the whole production job in a real module Worker on the synthetic slice disc. The model
// stage converts the five craft models the logic step binds and the debris model, then the three effect data Assets;
// the receiver validates every group complete, exactly as the same job in Node, and hands over the whole package.
test('test entry converts the models after the audio stage, and the receiver validates the models group as Node does', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await startImport(page, 'models', 'slice');
  await settled(page);
  const observed = await snapshots(page);
  const final = observed.at(-1)!;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  expect(distinctSteps(observed)).toEqual([
    'starting', 'running:null:-', 'running:identify-source:-', 'running:identify-source:identified', 'running:convert-graphics:identified',
    'running:convert-logic:identified', 'running:convert-audio:identified', 'running:convert-models:identified', 'finished',
  ]);
  const node = await nodeSliceRun();
  expect(validateGroup(CLASSIC_P2_SLICE, node.groups.get('models')!)).toMatchObject({ status: 'group-complete', group: 'models' });
  // The P2-05 palette and fonts with the production cockpit, HUD and map Assets complete the cockpit-hud-map group.
  expect(validateGroup(CLASSIC_P2_SLICE, node.groups.get('cockpit-hud-map')!)).toMatchObject({ status: 'group-complete', externalRequirements: [] });
  expect(final.groups).toEqual([
    { group: 'logic', status: 'group-complete', assets: 3, diagnostics: [] },
    { group: 'models', status: 'group-complete', assets: 1 + MODEL_TEXTURE_USAGE.assets + PRODUCTION_MODEL_USAGE.assets + PRODUCTION_EFFECT_USAGE.assets, diagnostics: [] },
    { group: 'cockpit-hud-map', status: 'group-complete', assets: 4 + COCKPIT_HUD_MAP_USAGE.assets, diagnostics: [] },
    { group: 'audio', status: 'group-complete', assets: PRODUCTION_SOUND_USAGE.assets, diagnostics: [] },
  ]);
  // The models manifest the owner received is the one Node sent: the flight palette, the textures, the bound models and
  // the effect data.
  const received = await page.evaluate(() => window.osrImport.received);
  expect(received.map(({ group }) => group)).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio']);
  const models = readGroupManifest(received[1].manifest);
  expect(models).toEqual(readGroupManifest(node.groups.get('models')!.manifest));
  expect(models.assets).toHaveLength(1 + MODEL_TEXTURE_USAGE.assets + PRODUCTION_MODEL_USAGE.assets + PRODUCTION_EFFECT_USAGE.assets);
  // The usage equals the Node run's. Independently of the job, the dimensions the contract names are the test support's
  // layout-derived graphics, sound, model and effect usage plus the logic Assets the owner received.
  expect(final.usage).toEqual(node.usage);
  const logic = readGroupManifest(received[0].manifest).assets;
  expect(final.usage).toMatchObject({
    assets: PRODUCTION_CONVERSION_USAGE.assets + logic.length + PRODUCTION_MODEL_USAGE.assets + PRODUCTION_EFFECT_USAGE.assets,
    payloadBytes: PRODUCTION_CONVERSION_USAGE.payloadBytes + PRODUCTION_MODEL_USAGE.payloadBytes + PRODUCTION_EFFECT_USAGE.payloadBytes
      + logic.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0),
    vertices: PRODUCTION_MODEL_USAGE.vertices + PRODUCTION_EFFECT_USAGE.vertices,
    triangles: PRODUCTION_MODEL_USAGE.triangles + PRODUCTION_EFFECT_USAGE.triangles,
    imagePixels: GRAPHICS_CONVERSION_USAGE.imagePixels,
  });
  const reads = observed.flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  expect(reads.at(-1)).toBe(final.usage.sourceReadBytes);
  expect(await page.evaluate(() => window.osrImport.owner!.takeGroups()?.map(({ group }) => group))).toEqual(['logic', 'models', 'cockpit-hud-map', 'audio']);
  expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([['models', 1, 1]]);
  expect(JSON.stringify(observed)).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

test('test entry fails a corrupt synthetic mesh at the source layer in the model stage, handing over no group', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await startImport(page, 'models-corrupt', 'slice-corrupt');
  await settled(page);
  const observed = await snapshots(page);
  expect(observed.at(-1)).toEqual({
    status: 'failed', jobId: 1, stage: 'convert-models',
    error: { layer: 'source', code: 'invalid-payload', location: 'models[model/base-1].parts[0][1].mesh', reason: expect.any(String), limit: null },
  });
  expect(await page.evaluate(() => window.osrImport.received)).toEqual([]);
  expect(await page.evaluate(() => window.osrImport.owner!.takeGroups())).toBeNull();
  expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([['models-corrupt', 1, 1]]);
  expect(JSON.stringify(observed)).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

test('cancelling at the first model progress terminates the Worker, and nothing changes afterwards', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => {
    window.osrImport.cancelAtStage = 'convert-models';
    window.osrImport.startFrames();
  });
  await startImport(page, 'models', 'slice');
  await page.waitForFunction(() => window.osrImport.log.some(entry => entry.event === 'cancel'));
  await framesAfter(page, 'cancel');
  const log = await page.evaluate(() => window.osrImport.log.map(entry => (entry.snapshot
    ? `snapshot:${entry.snapshot.status}:${'stage' in entry.snapshot ? entry.snapshot.stage : '-'}`
    : entry.event === 'cancel' ? `cancel:${String(entry.accepted)}` : entry.event)));
  const cancelAt = log.indexOf('cancel:true');
  // The subscriber cancelled on the first model snapshot, after the audio stage; the cancelled snapshot was synchronous.
  expect(log.slice(cancelAt - 2, cancelAt + 1)).toEqual(['snapshot:running:convert-models', 'snapshot:cancelled:convert-models', 'cancel:true']);
  expect(log.slice(0, cancelAt - 2).some(entry => entry === 'snapshot:running:convert-audio')).toBe(true);
  expect(log.slice(cancelAt + 1).every(entry => entry === 'frame')).toBe(true);
  expect(await page.evaluate(() => window.osrImport.owner!.getSnapshot())).toEqual({ status: 'cancelled', jobId: 1, stage: 'convert-models' });
  expect(await page.evaluate(() => window.osrImport.received)).toEqual([]);
  expect(await page.evaluate(() => window.osrImport.owner!.takeGroups())).toBeNull();
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'models', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

test('cancelling at the first graphics progress terminates the Worker, and nothing changes afterwards', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => {
    window.osrImport.cancelAtStage = 'convert-graphics';
    window.osrImport.startFrames();
  });
  await startImport(page, 'graphics', 'graphics');
  await page.waitForFunction(() => window.osrImport.log.some(entry => entry.event === 'cancel'));
  await framesAfter(page, 'cancel');
  const log = await page.evaluate(() => window.osrImport.log.map(entry => (entry.snapshot
    ? `snapshot:${entry.snapshot.status}:${'stage' in entry.snapshot ? entry.snapshot.stage : '-'}`
    : entry.event === 'cancel' ? `cancel:${String(entry.accepted)}` : entry.event)));
  const cancelAt = log.indexOf('cancel:true');
  // The subscriber cancelled on the first graphics snapshot; the cancelled snapshot was published synchronously.
  expect(log.slice(cancelAt - 2, cancelAt + 1)).toEqual(['snapshot:running:convert-graphics', 'snapshot:cancelled:convert-graphics', 'cancel:true']);
  expect(log.slice(0, cancelAt - 2).filter(entry => entry.startsWith('snapshot:running:convert-graphics'))).toEqual([]);
  expect(log.slice(cancelAt + 1).every(entry => entry === 'frame')).toBe(true);
  expect(await page.evaluate(() => window.osrImport.owner!.getSnapshot())).toEqual({ status: 'cancelled', jobId: 1, stage: 'convert-graphics' });
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'graphics', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

test('the page stays responsive while the Worker computes, and a cancelled job is replaced by a clean retry', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => {
    const button = Object.assign(document.createElement('button'), { textContent: 'busy probe' });
    button.dataset.testid = 'busy-probe';
    button.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:1000';
    button.addEventListener('click', event => { window.osrImport.record({ event: 'click', trusted: event.isTrusted }); });
    document.body.append(button);
    window.osrImport.startFrames();
  });
  await startImport(page, 'busy');
  // The busy scenario announces its endless loop with one progress message.
  await page.waitForFunction(() => window.osrImport.owner!.getSnapshot().status === 'running'
    && (window.osrImport.owner!.getSnapshot() as { stage: string | null }).stage === 'identify-source');
  await page.getByTestId('busy-probe').click();
  await framesAfter(page, 'click', 1);
  const cancelled = await page.evaluate(() => {
    const harness = window.osrImport;
    const accepted = harness.owner!.cancel();
    const status = harness.owner!.getSnapshot().status;
    harness.record({ event: 'cancel' });
    return { accepted, status };
  });
  expect(cancelled).toEqual({ accepted: true, status: 'cancelled' });
  await framesAfter(page, 'cancel');
  const order = await page.evaluate(() => window.osrImport.log.map(entry => (entry.snapshot
    ? `snapshot:${entry.snapshot.status}:${'stage' in entry.snapshot ? entry.snapshot.stage : '-'}` : entry.event)));
  const busyAt = order.indexOf('snapshot:running:identify-source');
  const clickAt = order.indexOf('click');
  const cancelAt = order.indexOf('cancel');
  expect(busyAt).toBeGreaterThan(-1);
  expect(clickAt).toBeGreaterThan(busyAt);
  expect(order.slice(clickAt, cancelAt)).toContain('frame');
  // The cancelled snapshot was published synchronously, before the cancel entry, and nothing followed.
  expect(order[cancelAt - 1]).toBe('snapshot:cancelled:identify-source');
  expect(order.slice(cancelAt + 1).every(entry => entry === 'frame')).toBe(true);
  expect(await page.evaluate(() => window.osrImport.log.find(entry => entry.event === 'click')!.trusted)).toBe(true);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'busy', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  // Retry with the same owner and files: a new Worker and job ID; no state of the cancelled job appears again.
  const retryFrom = await page.evaluate(() => window.osrImport.log.length);
  await startImport(page, 'synthetic', 'production-sized');
  await settled(page);
  const retry = await page.evaluate(from => window.osrImport.log.slice(from).flatMap(entry => (entry.snapshot ? [entry.snapshot] : [])), retryFrom);
  expect(retry[0]).toEqual({ status: 'starting', jobId: 2 });
  expect(retry.every(snapshot => 'jobId' in snapshot && snapshot.jobId === 2)).toBe(true);
  expect(retry.at(-1)!.status).toBe('finished');
  expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([['busy', 1, 1], ['synthetic', 1, 1]]);
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

for (const [entry, code, posts] of [
  ['missing', 'worker-start-failed', 0],
  ['top-level-throw', 'worker-start-failed', 0],
  ['late-error', 'worker-failed', 1],
  ['job-throws', 'internal-error', 1],
] as const) {
  test(`${entry} ends the job with ${code}, and nothing names a file or carries the exception text`, async ({ page }) => {
    const consoled = consoleText(page);
    await openHarness(page);
    await startImport(page, entry);
    await settled(page);
    const observed = await snapshots(page);
    const reason = {
      'worker-start-failed': 'the import Worker could not start', 'worker-failed': 'the import Worker failed', 'internal-error': 'the import job failed unexpectedly',
    }[code];
    expect(observed.at(-1)).toEqual({
      status: 'failed', jobId: 1, stage: entry === 'late-error' ? 'identify-source' : null,
      error: { layer: 'import', code, location: code === 'internal-error' ? 'job' : 'worker', reason, limit: null },
    });
    // Each case loads its own entry; a Worker that never sent ready never receives start.
    expect(await probe(page)).toEqual({
      workers: [{
        entry: entry === 'missing' ? '/src/workers/missing-import-worker.ts' : '/src/workers/import-worker.test-support.ts',
        viteWorker: false, type: 'module', name: entry === 'missing' ? '' : entry, posts, terminations: 1,
      }],
      activeListeners: 0, listeners: 3,
    });
    expect(JSON.stringify(observed)).not.toContain(MARKER);
    expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
  });
}

test('disposing the owner during a job terminates the Worker, removes its listeners and stops notifications', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => { window.osrImport.startFrames(); });
  await startImport(page, 'busy');
  await page.waitForFunction(() => (window.osrImport.owner!.getSnapshot() as { stage?: string | null }).stage === 'identify-source');
  await page.evaluate(() => {
    window.osrImport.owner!.dispose();
    window.osrImport.record({ event: 'dispose' });
  });
  await framesAfter(page, 'dispose');
  const order = await page.evaluate(() => window.osrImport.log.map(entry => entry.event));
  expect(order.slice(order.indexOf('dispose') + 1).every(event => event === 'frame')).toBe(true);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'busy', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(await page.evaluate(() => window.osrImport.owner!.start([...window.osrImport.files]))).toEqual({ status: 'disposed' });
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

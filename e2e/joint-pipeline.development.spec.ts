import type { Page, TestInfo } from '@playwright/test';
import { diagnoseMission } from '../src/app/resources/mission-diagnostics.ts';
import { resolveEntry, viewerCatalog, type ResolvedEntry, type ViewerEntry } from '../src/app/viewer/viewer-items.ts';
import { validatePackage } from '../src/content/completeness.ts';
import type { ContentIdentity } from '../src/content/content-identity.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { readPayloadRecords } from '../src/content/payload.ts';
import { sha256Fingerprint } from '../src/content/sha256.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { readSoundPayload, soundChannelData } from '../src/content/sound-payload.ts';
import { defaultCampaignSpec, defaultScenarioSpec, ENTRY_IDS } from '../src/original-data/formats/formats.test-support.ts';
import type { ResourceCacheKey } from '../src/platform/storage/resource-cache-contract.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import type { ViewerItem } from '../src/render/viewer/viewer-renderer.ts';
import { applyViewAction, INITIAL_VIEW, type ViewerView } from '../src/render/viewer/viewer-view.ts';
import type { ViewportLayout } from '../src/render/viewport/viewport-layout.ts';
import { missionLines, variantLabel } from '../src/ui/viewer/viewer-copy.ts';
import { IMPORT_STAGES } from '../src/workers/import-protocol.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { button, openTestEntry, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import type { ProbeSnapshot } from './support/browser-probes.ts';
import {
  canaryFiles, canaryPackage, developmentCanaries, expectCacheArrival, expectInputArrival, expectPayloadArrival, type CanarySet,
} from './support/canaries.ts';
import { endPlaceholder, enterMission, expectAdvancingTick, missionEntry } from './support/mission-observations.ts';
import { expectedPackage, ResourceBalance, type ExpectedPackage } from './support/resource-balance.ts';
import {
  attachResponsiveness, describeResponsiveness, installResponsiveness, measureResponsiveness, ResponsivenessWindow, type ResponsivenessRecord,
} from './support/responsiveness.ts';
import { bufferPixels, entryButton, pictureOf, pictureSamples, solidSamples, viewerDiagnostics, type Sample } from './support/viewer-observations.ts';

// P2-12 subtask 06 (S-02, S-03, S-05 and AC-02, AC-04, AC-05 development parts, AC-10): the joint pipeline on the
// development test entry. The real module Worker runs the whole production job of the `canary` scenario on the canary
// slice disc, chosen through the import page's file chooser; the package is committed, viewed and auditioned, restored
// after a same-origin reload and viewed again, and a mission run starts from it beside them (P3-04 replaced the retired
// synthetic demo). Expected pixels, sounds, identity and mission summary come from the same disc converted in Node by
// the same job and from the fixture's own scenario spec. Resource balance, the real import, commit and restore windows, and the network audit with every canary run
// throughout; nothing slows the Worker.

test.describe.configure({ timeout: 600_000 });

/** A started source as the voice watcher saw it: the samples of the buffer it played, its `stop()` calls and its end. */
interface WatchedVoice extends SoundBuffer { stops: number; ended: boolean }

declare global {
  interface Window {
    osrJointStatuses?: { readonly seen: string[][]; stop(): string[][] };
    osrJointVoices?: WatchedVoice[];
  }
}

const SAVED_BY_COMMIT = /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/;
const SAVED_BY_RESTORE = /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/;
const MISSION_LOADS = 'Mission loads into Core';
const COMPLETE_IMPORT = ['Source identified', 'Complete resources, viewable', SAVED_BY_COMMIT, MISSION_LOADS];
const SAVED_MENU = ['Complete resources, viewable', SAVED_BY_COMMIT, MISSION_LOADS];
const RESTORED_MENU = ['Complete resources, viewable', SAVED_BY_RESTORE, MISSION_LOADS];
const HELD = 'Original game data: Resources are held in this page.';

/** One trusted audition per core sound role: fire, missile, explosion and Warp. */
const SOUNDS = Object.freeze(['sound/fire/player', 'sound/missile', 'sound/explosion/player', 'sound/warp']);

/** The Worker messages of one job, consecutive repeats merged: every stage in protocol order, then the four groups. */
const STEPS = Object.freeze(['ready', 'progress/identify-source', 'identified', ...IMPORT_STAGES.slice(1).map(stage => `progress/${stage}`), 'group', 'finished']);

interface SoundBuffer { readonly sampleRate: number; readonly length: number; readonly channels: readonly (readonly number[])[] }

const statuses = (page: Page, testId: string) => page.getByTestId(testId).locator('li');
const midTone = (rgb: readonly number[]): boolean => rgb.some(channel => channel > 0 && channel < 255);
const turned = (steps: number): ViewerView => applyViewAction(INITIAL_VIEW, { type: 'rotate', axis: 'horizontal', steps });
const keyOf = ({ origin, converterVersion }: ContentIdentity): ResourceCacheKey => {
  if (origin.type !== 'original-import') throw new Error('The canary package must be an original import');
  return Object.freeze({ originType: 'original-import', originToken: origin.sourceFingerprint, converterVersion });
};

/** What the canary disc converts to in Node, and what the page must show of it. */
interface Expected {
  readonly identity: ContentIdentity;
  readonly package: ExpectedPackage;
  /** Every Asset's payload fingerprint, in Asset ID order. */
  readonly fingerprints: readonly (readonly [string, string])[];
  /** The mission summary as the Node diagnosis gives it, and lines the fixture's own specs fix independently. */
  readonly mission: readonly string[];
  readonly fixtureMission: readonly RegExp[];
  /** Every sound of the audio group, decoded as its buffer must hold it. */
  readonly sounds: ReadonlyMap<string, SoundBuffer>;
  readonly entries: readonly { readonly entry: ViewerEntry; readonly resolved: ResolvedEntry }[];
}

let expectation: Promise<Expected> | undefined;
/** The Node expectations, computed once per worker process. */
function expected(): Promise<Expected> {
  return expectation ??= (async () => {
    const groups = await canaryPackage();
    const completeness = validatePackage(CLASSIC_P2_SLICE, groups);
    if (completeness.status !== 'complete') throw new Error('The canary package is not complete in Node');
    const { identity } = completeness;
    const fingerprints = groups.flatMap(({ manifest }) => readGroupManifest(manifest).assets.map(({ id, payloadIdentity }): readonly [string, string] => [id, payloadIdentity.fingerprint]))
      .sort(([left], [right]) => (left < right ? -1 : 1));
    // Each fingerprint is the SHA-256 of the payload it describes.
    const payloads = new Map(groups.flatMap(({ payloads: records }) => readPayloadRecords(records).map(({ id, bytes }): [string, Uint8Array] => [id, bytes])));
    for (const [id, fingerprint] of fingerprints) expect(sha256Fingerprint(payloads.get(id)!), id).toBe(fingerprint);
    const audio = readGroupManifest(groups.find(({ group }) => group === 'audio')!.manifest).assets.filter(({ kind }) => kind === 'sound');
    const sounds = new Map(audio.map(({ id }) => {
      const payload = readSoundPayload(payloads.get(id)!);
      return [id as string, { sampleRate: payload.sampleRate, length: payload.frames, channels: soundChannelData(payload).map(data => [...data]) }] as const;
    }));
    for (const id of SOUNDS) expect(sounds.has(id), id).toBe(true);
    const diagnosis = diagnoseMission(groups);
    if (diagnosis.status !== 'loaded') throw new Error(`The canary mission does not load in Node: ${diagnosis.status}`);
    // The fixture's own scenario and campaign specs, independently of the converter.
    const scenario = defaultScenarioSpec();
    const { groups: campaign, wingmen } = defaultCampaignSpec();
    const group = campaign.findIndex(slots => slots.some(([entry]) => entry === ENTRY_IDS.scenario));
    const slot = campaign[group].findIndex(([entry]) => entry === ENTRY_IDS.scenario);
    const counts = {
      declarations: scenario.records.length, groups: scenario.groups!.length, spawnRegions: scenario.regions!.length,
      wingmanOptions: wingmen.length, namePool: scenario.names!.length,
    };
    expect(diagnosis.summary).toMatchObject({ campaign: { group, slot }, counts });
    const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
    const fixtureMission = [
      new RegExp(`^Mission \\S+, campaign group ${group}, slot ${slot}$`),
      new RegExp(`^${plural(counts.declarations, 'declaration')} \\(player is declaration \\d+\\), ${plural(counts.groups, 'group')}, `
        + `${plural(counts.spawnRegions, 'spawn region')}, ${plural(counts.wingmanOptions, 'wingman option')}, ${plural(counts.namePool, 'pool name')}$`),
    ];
    const { entries, payloads: catalogued } = viewerCatalog(groups);
    return Object.freeze({
      identity, package: expectedPackage(keyOf(identity), groups), fingerprints, mission: missionLines(diagnosis)!, fixtureMission, sounds,
      entries: entries.map(entry => {
        const resolution = resolveEntry(entry, catalogued);
        if (resolution.status !== 'resolved') throw new Error(`${entry.id} does not resolve: ${resolution.failure.code}`);
        return { entry, resolved: resolution.entry };
      }),
    });
  })();
}

/** One viewer item read back: a 3D item's samples are fixed by the layout and view, a 2D item's by its placement. */
interface ViewCase {
  readonly kind: ViewerEntry['kind'];
  readonly id: string;
  readonly variant: string | null;
  readonly item: ViewerItem;
  readonly turns: number;
  readonly samples: readonly Sample[] | null;
}

/**
 * One item of each viewer kind: the first model part list with a textured sample, a textured missile view whose samples
 * lie on no seam-spanning polygon, and the first image, palette, layout and font.
 */
function viewCases({ entries }: Expected, layout: ViewportLayout): ViewCase[] {
  const of = (kind: ViewerEntry['kind'], role?: string) => entries.filter(({ entry }) => entry.kind === kind && (role === undefined || entry.role === role));
  const model = of('model').flatMap(({ entry, resolved }) => resolved.variants.flatMap((variant, at) => {
    if (variant.kind !== 'part-list' || variant.parts === 0) return [];
    const item = resolved.item(at)!;
    const samples = solidSamples(item, layout);
    return samples.some(({ textured }) => textured) && samples.some(({ rgb }) => midTone(rgb))
      ? [{ kind: entry.kind, id: entry.id, variant: variantLabel(variant), item, turns: 0, samples }] : [];
  }))[0];
  const [missile] = of('effect', 'missile');
  const effect = [0, 3].flatMap(turns => missile.resolved.variants.flatMap((variant, at) => {
    if (variant.kind !== 'effect-view') return [];
    const item = missile.resolved.item(at)!;
    const samples = solidSamples(item, layout, turned(turns));
    return samples.some(({ rgb, textured }) => textured && midTone(rgb))
      ? [{ kind: missile.entry.kind, id: missile.entry.id, variant: variantLabel(variant), item, turns, samples }] : [];
  }))[0];
  expect(model, 'a textured model part list to read back').toBeDefined();
  expect(effect, 'a textured missile view to read back').toBeDefined();
  const pictures = (['image', 'palette', 'layout', 'font'] as const).map(kind => {
    const [{ entry, resolved }] = of(kind);
    return { kind, id: entry.id, variant: null, item: resolved.item(0)!, turns: 0, samples: null };
  });
  return [model, effect, ...pictures];
}

/** The cases by viewport layout, as solid samples take a while to find. */
const casesByLayout = new Map<string, ViewCase[]>();

/** What one view of the held package showed. */
interface Viewed {
  readonly identity: string;
  /** The listed items' Asset IDs, in the page's order, by kind. */
  readonly entries: readonly string[];
  readonly mission: readonly string[];
  /** The read-back bytes of each case, by Asset ID. */
  readonly pixels: Readonly<Record<string, readonly (readonly number[])[]>>;
}

/**
 * Records, from now on in the page's current document, the buffer each started source plays, its `stop()` calls and its
 * end. Test wiring over the audio probe: it wraps the source's `start` and `stop`, and observes the end through the
 * handler property, so the probes' listener registry is unchanged.
 */
const watchVoices = (page: Page) => page.evaluate(() => {
  if (window.osrJointVoices) return;
  const voices: WatchedVoice[] = [];
  const prototype = AudioBufferSourceNode.prototype;
  const { start, stop } = prototype;
  const watched = new WeakMap<AudioScheduledSourceNode, WatchedVoice>();
  prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>): void {
    const { buffer } = this;
    const voice: WatchedVoice = {
      sampleRate: buffer?.sampleRate ?? 0, length: buffer?.length ?? 0,
      channels: buffer ? Array.from({ length: buffer.numberOfChannels }, (_, channel) => [...buffer.getChannelData(channel)]) : [],
      stops: 0, ended: false,
    };
    voices.push(voice);
    watched.set(this, voice);
    this.onended = () => { voice.ended = true; };
    start.apply(this, args);
  };
  prototype.stop = function (this: AudioScheduledSourceNode, ...args: Parameters<AudioScheduledSourceNode['stop']>): void {
    const voice = watched.get(this);
    if (voice) voice.stops++;
    stop.apply(this, args);
  };
  window.osrJointVoices = voices;
});

/** How one audition ended: by the Stop click's `stop()`, or on its own first (the synthetic sounds last a few ms). */
interface Audition { readonly id: string; readonly ended: 'stopped' | 'naturally' }

/**
 * Opens the viewer on the held package and checks it against Node: the identity line and mission summary; one item of
 * each kind read back byte for byte, its warm GPU counts recorded; every sound's buffer as loaded, and one trusted
 * audition of each core role, whose source plays that role's buffer, then ends and is disconnected after its Stop
 * click. Returns to the menu.
 */
async function viewPackage(page: Page, balance: ResourceBalance): Promise<{ readonly viewed: Viewed; readonly auditions: readonly Audition[] }> {
  const want = await expected();
  await watchVoices(page);
  const buffered = await page.evaluate(() => window.osrAudioProbe.buffers(Number.MAX_SAFE_INTEGER).length);
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  const identity = await page.getByTestId('viewer-identity').innerText();
  expect(identity).toBe(`Package identity: manifest ${want.identity.manifestIdentity}, converter ${want.identity.converterVersion}`);
  const entries = (await page.getByTestId('viewer-entries').getByRole('button').allInnerTexts()).map(name => name.split(' (')[0]);
  expect([...entries].sort()).toEqual(want.entries.map(({ entry }) => entry.id).sort());
  const mission = await statuses(page, 'viewer-mission-summary').allInnerTexts();
  expect(mission).toEqual(want.mission);
  expect(mission).toEqual(expect.arrayContaining(want.fixtureMission.map(line => expect.stringMatching(line))));

  const { layout } = await viewerDiagnostics(page);
  const key = JSON.stringify(layout);
  const cases = casesByLayout.get(key) ?? viewCases(want, layout!);
  casesByLayout.set(key, cases);
  const pixels: Record<string, readonly (readonly number[])[]> = {};
  const auditions: Audition[] = [];
  for (const { kind, id, variant, item, turns, samples: fixed } of cases) {
    await entryButton(page, id).click();
    if (variant !== null) await page.getByRole('radio', { name: variant, exact: true }).check();
    await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${id}`);
    let shown = await viewerDiagnostics(page);
    expect(shown.state).toBe('ready');
    balance.warm(id, shown.gpu);
    for (let step = 0; step < turns; step++) await button(page, 'Turn down').click();
    if (turns > 0) {
      shown = await viewerDiagnostics(page);
      expect(shown.view).toEqual(turned(turns));
    }
    const samples = fixed ?? pictureSamples(pictureOf(item), shown.placement!);
    expect(samples.length, `${id} samples`).toBeGreaterThan(0);
    // A glyph sheet is white, black and grid grey by convention; every other item has a mid-tone sample.
    if (kind !== 'font') expect(samples.some(({ rgb }) => midTone(rgb)), `${id} has a mid-tone sample`).toBe(true);
    const read = await bufferPixels(page, shown.layout!, samples);
    expect(read, `${kind} ${id}`).toEqual(samples.map(({ rgb }) => [...rgb]));
    pixels[id] = read;
    if (turns > 0) await button(page, 'Reset view').click();
  }

  // Every sound of the package was loaded into a buffer of exactly its samples.
  const text = (buffer: SoundBuffer) => JSON.stringify([buffer.sampleRate, buffer.length, buffer.channels]);
  const loaded = await page.evaluate(from => window.osrAudioProbe.buffers(Number.MAX_SAFE_INTEGER).slice(from), buffered);
  expect(loaded.map(text).sort()).toEqual([...want.sounds.values()].map(text).sort());
  for (const id of SOUNDS) {
    const [from, started] = await page.evaluate(() => [window.osrJointVoices!.length, window.osrAudioProbe.started()]);
    await button(page, `Play ${id}`).click();
    await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'running');
    await expect.poll(() => page.evaluate(() => window.osrAudioProbe.started()), `${id} started`).toBe(started + 1);
    const voices = await page.evaluate(at => window.osrJointVoices!.slice(at), from);
    expect(voices.map(text), `${id} plays its own buffer`).toEqual([text(want.sounds.get(id)!)]);
    await button(page, `Stop ${id}`).click();
    await expect(page.getByTestId('viewer-voices')).toHaveText('0');
    await expect.poll(() => page.evaluate(at => window.osrJointVoices![at].ended, from), `${id} ended`).toBe(true);
    await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed()), `${id} disconnected`).toBe(0);
    const stops = await page.evaluate(at => window.osrJointVoices![at].stops, from);
    expect(stops).toBeLessThanOrEqual(1);
    auditions.push({ id, ended: stops === 1 ? 'stopped' : 'naturally' });
  }
  await expect(page.getByTestId('viewer-audition-failure')).toHaveCount(0);

  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  return { viewed: { identity, entries, mission, pixels }, auditions };
}

/** Records every distinct list of import statuses the page renders, from now until `stopStatuses`. */
const recordStatuses = (page: Page) => page.evaluate(() => {
  const seen: string[][] = [];
  let last = '';
  const read = (): void => {
    const list = document.querySelector('[data-testid="import-statuses"]');
    const texts = list ? [...list.querySelectorAll('li')].map(item => item.textContent ?? '') : [];
    const key = JSON.stringify(texts);
    if (key === last) return;
    last = key;
    seen.push(texts);
  };
  const observer = new MutationObserver(read);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  window.osrJointStatuses = {
    seen,
    stop: () => {
      read();
      observer.disconnect();
      delete window.osrJointStatuses;
      return seen;
    },
  };
});

const stopStatuses = (page: Page) => page.evaluate(() => window.osrJointStatuses!.stop());

/**
 * The P2-11 state ladder's rung of rendered import statuses, or -1 when the list holds under no condition: nothing yet;
 * the source identified; the complete package held while it is being saved; saved by the commit. The mission status
 * may come with either of the last two, as loading and saving have no order.
 */
function rung(texts: readonly string[]): number {
  const [identified, complete, ...rest] = texts;
  if (texts.length === 0) return 0;
  if (identified !== 'Source identified') return -1;
  if (texts.length === 1) return 1;
  if (complete !== 'Complete resources, viewable') return -1;
  const cache = rest.at(-1) === MISSION_LOADS ? rest.slice(0, -1) : rest;
  if (cache.length === 2 && cache[0] === 'Held in memory only' && cache[1] === 'Saving in this browser') return 2;
  if (cache.length === 1 && SAVED_BY_COMMIT.test(cache[0])) return 3;
  return -1;
}

/** The newest Worker once it has run one job and was terminated once. */
async function jobWorker(page: Page, before: number): Promise<ProbeSnapshot['workers'][number]> {
  let workers: ProbeSnapshot['workers'] = [];
  await expect.poll(async () => {
    workers = (await page.evaluate(() => window.osrProbe.snapshot().workers)).slice(before);
    return workers.map(({ jobs, terminations }) => [jobs.length, terminations]);
  }).toEqual([[1, 1]]);
  return workers[0];
}

/** The page's stored package: each group's identity and payload fingerprints, and each stored payload's SHA-256. */
async function storedPackage(page: Page) {
  return page.evaluate(async ({ name, packageStore, payloadStore }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(request.error); };
    });
    try {
      const all = (store: string) => new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly');
        const keys = transaction.objectStore(store).getAllKeys();
        const values = transaction.objectStore(store).getAll();
        transaction.oncomplete = () => { resolve({ keys: keys.result, values: values.result }); };
        transaction.onabort = () => { reject(transaction.error); };
      });
      type Stored = { groups: { manifest: { group: string; identity: unknown; assets: { id: string; payloadIdentity: { fingerprint: string } }[] } }[] };
      const [{ values }, payloads] = await Promise.all([all(packageStore), all(payloadStore)]);
      const packages = values as Stored[];
      const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return {
        packages: packages.map(({ groups }) => groups.map(({ manifest: { group, identity, assets } }) => ({
          group, identity, fingerprints: assets.map(({ id, payloadIdentity }) => [id, payloadIdentity.fingerprint] as [string, string]),
        }))),
        digests: await Promise.all(payloads.keys.map(async (key, index) => {
          const { bytes } = payloads.values[index] as { bytes: ArrayBuffer };
          return [(key as string[])[3], `sha256:${hex(await crypto.subtle.digest('SHA-256', bytes))}`] as [string, string];
        })),
      };
    } finally {
      db.close();
    }
  }, RESOURCE_CACHE_DATABASE);
}

/** The stored package's identity and fingerprints, checked against Node: the full content identity in every group. */
async function expectStored(page: Page): Promise<Awaited<ReturnType<typeof storedPackage>>> {
  const want = await expected();
  const stored = await storedPackage(page);
  expect(stored.packages).toHaveLength(1);
  const [groups] = stored.packages;
  expect(groups.map(({ group }) => group)).toEqual([...CLASSIC_P2_SLICE.groups]);
  for (const { group, identity } of groups) expect(identity, `${group} identity`).toEqual(want.identity);
  const byId = ([left]: readonly [string, string], [right]: readonly [string, string]) => (left < right ? -1 : 1);
  expect(groups.flatMap(({ fingerprints }) => fingerprints).sort(byId)).toEqual(want.fingerprints);
  expect([...stored.digests].sort(byId)).toEqual(want.fingerprints);
  return stored;
}

interface Imported {
  readonly records: readonly ResponsivenessRecord[];
  readonly states: readonly (readonly string[])[];
  readonly steps: readonly string[];
}

/**
 * From the menu: chooses the canary disc's files, starts the import inside an `import` window and waits for its
 * result; adopts the `commit` window the test entry opened as the commit started and closes it once saved. Checks
 * the rendered statuses against the ladder, the groups, and the job's Worker and messages; stays on the import page.
 */
async function importCanary(page: Page, audit: Audit, files: readonly FilePayload[]): Promise<Imported> {
  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await page.locator('#import-files').setInputFiles([...files]);
  const before = (await page.evaluate(() => window.osrProbe.snapshot().workers)).length;
  await recordStatuses(page);
  const importing = await ResponsivenessWindow.open(page, 'import');
  await button(page, 'Start import').click();
  await audit.ready();
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished', { timeout: 60_000 });
  const imported = await importing.close();
  await expect.poll(() => page.evaluate(() => window.osrResponsiveness!.find('commit'))).not.toBeNull();
  const committing = await ResponsivenessWindow.adopt(page, 'commit');
  await expect(statuses(page, 'import-statuses')).toHaveText(COMPLETE_IMPORT, { timeout: 30_000 });
  const committed = await committing.close();
  const states = await stopStatuses(page);

  await expect(page.getByTestId('import-result')).toHaveText(/^Import finished in \d+(?: ms|\.\d\d s): identified synthetic-canary\.$/);
  expect(await statuses(page, 'import-groups').evaluateAll(items => items.map(item => `${item.dataset.group}: ${item.dataset.status}`)))
    .toEqual(CLASSIC_P2_SLICE.groups.map(group => `${group}: complete`));
  // Every rendered list holds under its condition, and the ladder never goes back.
  const rungs = states.map(rung);
  expect(rungs, JSON.stringify(states)).not.toContain(-1);
  expect(rungs).toEqual([...rungs].sort((left, right) => left - right));
  expect(rungs.at(-1)).toBe(3);

  // One real module Worker of the test entry ran the canary job through every stage in order and was terminated once.
  const worker = await jobWorker(page, before);
  expect(worker).toMatchObject({ entry: '/src/workers/import-worker.test-support.ts', type: 'module', name: 'canary', posts: 1, jobs: [1] });
  const steps = worker.messages.map(({ type, stage }) => (stage ? `${type}/${stage}` : type ?? 'unknown'));
  const runs = steps.reduce<[string, number][]>((merged, step) => {
    if (merged.at(-1)?.[0] === step) merged.at(-1)![1]++;
    else merged.push([step, 1]);
    return merged;
  }, []);
  expect(runs.map(([step]) => step)).toEqual(STEPS);
  expect(runs.find(([step]) => step === 'group')![1]).toBe(CLASSIC_P2_SLICE.groups.length);
  expect(worker.messages.slice(1).every(({ jobId }) => jobId === worker.jobs[0])).toBe(true);
  expect(worker.messages.every(({ at }) => at < worker.terminatedAt!)).toBe(true);
  return { records: [imported, committed], states, steps: runs.map(([step, count]) => (count > 1 ? `${step} ×${count}` : step)) };
}

/** Leaves the import page for the menu, which shows the saved package. */
async function toMenu(page: Page): Promise<void> {
  await button(page, 'Return to menu').click();
  await expect(button(page, 'Import original game data')).toBeFocused();
  await expect(page.getByTestId('original-data-status')).toHaveText(HELD);
  await expect(statuses(page, 'resource-statuses')).toHaveText(SAVED_MENU);
}

/** What a mission visit showed: its owner and the ticks the run advanced over. */
interface MissionReading { readonly owner: number | null; readonly ticks: { readonly from: number; readonly to: number } }

/**
 * Runs the mission beside the held package (P3-04, replacing the retired synthetic demo): it starts a run from the main
 * menu with the preselected wingman, sees its tick advance, and returns. It creates no Worker; the owner's WebGL
 * surfaces for the flight picture (P3-12) and the owner's one audio context, which the trusted Start click unlocks
 * (P3-14 S-08), are released on return. It leaves the held package and its statuses as they were.
 */
async function runMission(page: Page): Promise<MissionReading> {
  const menu = await statuses(page, 'resource-statuses').allInnerTexts();
  const count = () => page.evaluate(() => {
    const { workers, canvases } = window.osrProbe.snapshot();
    return { workers: workers.length, canvases: canvases.length, contexts: window.osrAudioProbe.records().length };
  });
  const before = await count();
  const flightCanvas = () => page.evaluate(at => window.osrProbe.snapshot().canvases.slice(at), before.canvases);
  const missionContexts = () => page.evaluate(at => window.osrAudioProbe.records().slice(at), before.contexts);
  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  const ticks = await expectAdvancingTick(page);
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  // The owner's flight surfaces: the test entry's StrictMode opens and releases a first owner before the one that runs,
  // so the probes saw two canvases, each released with its context. The first owner is released before its close
  // barrier lets it create a controller, so only the running owner has an audio context, closed on return.
  const after = await count();
  expect({ ...after, canvases: before.canvases, contexts: before.contexts }).toEqual(before);
  expect(await flightCanvas()).toEqual([
    expect.objectContaining({ connected: false, lost: true }), expect.objectContaining({ connected: false, lost: true }),
  ]);
  await expect.poll(missionContexts, { message: 'the owner\'s one audio context, closed' }).toEqual([
    expect.objectContaining({ state: 'closed', closes: ['resolved'] }),
  ]);
  expect(await statuses(page, 'resource-statuses').allInnerTexts()).toEqual(menu);
  return { owner, ticks };
}

/**
 * Lets Playwright set up its own listeners in the page's current document before a menu baseline: its main-world
 * script, created on first use and kept for the document, registers capture listeners on `window` that the probes
 * count as test registrations.
 */
const settleTooling = (page: Page) => page.locator('body').evaluate(() => undefined);

/** Attaches the canary arrival proofs: each marker with the stages it was proven to reach, the cache in every round. */
async function attachCanaries(testInfo: TestInfo, set: CanarySet, cacheRounds: readonly number[]): Promise<void> {
  await testInfo.attach('canary-arrival', {
    contentType: 'application/json',
    body: JSON.stringify({ markers: set.markers.map(({ name, stages }) => ({ name, proven: stages })), cacheRounds }, null, 1),
  });
}

/**
 * Opens the canary test entry with every probe, under an audit watching every canary, whose markers are proven in the
 * chosen files and in the package the same job converts in Node; returns the files and markers.
 */
async function open(page: Page, audit: Audit) {
  const [set, files] = await Promise.all([developmentCanaries(), canaryFiles()]);
  audit.canaries(...set.markers.map(({ name, bytes }) => ({ name, value: bytes })));
  expectInputArrival(files, set);
  expectPayloadArrival(await canaryPackage(), set);
  await page.addInitScript(installAudioProbe);
  await installResponsiveness(page);
  await openTestEntry(page, { worker: 'canary' });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  const profile = await page.evaluate(() => window.osrTestEntry!.profile);
  const want = await expected();
  expect(keyOf(want.identity)).toEqual({ originType: 'original-import', originToken: profile.sourceFingerprint, converterVersion: profile.converterVersion });
  return { set, files, want };
}

/** Requires that no window had a long task; `attachResponsiveness` keeps the records whatever the outcome. */
function expectNoLongTasks(testInfo: TestInfo, records: readonly ResponsivenessRecord[]): void {
  for (const record of records) console.info(`${testInfo.title.slice(0, 24)}… ${describeResponsiveness(record)}`);
  expect(records.map(({ operation, longTaskCount, longTasks }) => ({ operation, longTaskCount, longTasks })))
    .toEqual(records.map(({ operation }) => ({ operation, longTaskCount: 0, longTasks: [] })));
}

test('three rounds of real import, commit, viewing, reload and verified restore, with the mission apart (AC-02, AC-04, AC-05, AC-10)', async ({ page, audit }, testInfo) => {
  const { set, files, want } = await open(page, audit);
  const records: ResponsivenessRecord[] = [];
  const auditions: Audition[] = [];
  const cacheRounds: number[] = [];
  const rounds: unknown[] = [];
  // Without a package the mission cannot start; each round's package can.
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });
  try {
    for (let round = 1; round <= 3; round++) {
      audit.phase(`round ${round}: import`);
      const imported = await importCanary(page, audit, files);
      records.push(...imported.records);
      await toMenu(page);
      balance.expectPackages([want.package]);
      const stored = await expectStored(page);
      await expectCacheArrival(page, set);
      cacheRounds.push(round);
      const { viewed, auditions: heard } = await viewPackage(page, balance);
      auditions.push(...heard);
      await balance.beforeReload(`round ${round}: before reload`);

      audit.phase(`round ${round}: reload and restore`);
      await page.reload();
      await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
      await expect(button(page, 'View resources')).toHaveCount(0);
      await settleTooling(page);
      await balance.rebaseline(`round ${round}: baseline after reload`);
      records.push(await measureResponsiveness(page, 'restore', async () => {
        await button(page, 'Open saved resources').click();
        await expect(statuses(page, 'resource-statuses')).toHaveText(RESTORED_MENU, { timeout: 30_000 });
      }));
      await expect(button(page, 'View resources')).toBeFocused();
      await expect(page.getByTestId('original-data-status')).toHaveText(HELD);
      // The same identity, fingerprints, pixels and mission summary as before the reload.
      expect(await expectStored(page)).toEqual(stored);
      const restored = await viewPackage(page, balance);
      expect(restored.viewed).toEqual(viewed);
      auditions.push(...restored.auditions);
      await balance.check(`round ${round}: restored and viewed`);

      audit.phase(`round ${round}: mission`);
      const mission = await runMission(page);
      await expect(page.getByTestId('original-data-status')).toHaveText(HELD);
      await balance.check(`round ${round}: after the mission`);
      rounds.push({ round, states: imported.states, steps: imported.steps, identity: viewed.identity, mission });
    }
  } finally {
    await testInfo.attach('joint-rounds', { contentType: 'application/json', body: JSON.stringify({ rounds, auditions }, null, 1) });
    await attachCanaries(testInfo, set, cacheRounds);
    await attachResponsiveness(testInfo, records);
    await balance.attach();
  }
  expect(records.map(({ operation }) => operation)).toEqual(Array(3).fill(['import', 'commit', 'restore']).flat());
  expectNoLongTasks(testInfo, records);
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
});

test('three imports and views in one document keep warm GPU counts equal and own nothing after each exit (AC-04)', async ({ page, audit }, testInfo) => {
  const { files, want } = await open(page, audit);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });
  const records: ResponsivenessRecord[] = [];
  const documentId = balance.document;
  try {
    for (let round = 1; round <= 3; round++) {
      audit.phase(`round ${round}`);
      records.push(...(await importCanary(page, audit, files)).records);
      await toMenu(page);
      balance.expectPackages([want.package]);
      await viewPackage(page, balance);
      const { snapshot } = await balance.check(`round ${round}`);
      // Nothing the rounds created is still owned: every Worker ended after its one job, every context closed, and
      // every viewer canvas left the document with its context lost.
      expect(snapshot.probe.document).toBe(documentId);
      expect(snapshot.probe.workers.map(({ jobs, terminations }) => [jobs.length, terminations])).toEqual(Array(round).fill([1, 1]));
      expect(snapshot.audio!.contexts.map(({ state, closes }) => [state, closes])).toEqual(Array(round).fill(['closed', ['resolved']]));
      expect(snapshot.probe.canvases.length).toBe(round);
      expect(snapshot.probe.canvases.filter(({ connected, extension, lost }) => connected || (extension && !lost))).toEqual([]);
    }
  } finally {
    await attachResponsiveness(testInfo, records);
    await balance.attach();
  }
  expectNoLongTasks(testInfo, records);
});

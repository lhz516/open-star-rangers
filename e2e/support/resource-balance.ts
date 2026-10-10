import { expect, type Page, type TestInfo } from '@playwright/test';
import type { GroupInput } from '../../src/content/completeness.ts';
import { packageRecordKey, payloadRecordKey, type ResourceCacheKey } from '../../src/platform/storage/resource-cache-contract.ts';
import { inDefinitionOrder, readGroupInputs, RESOURCE_CACHE_DATABASE } from '../../src/platform/storage/resource-cache-records.ts';
import type { AudioContextRecord } from './audio-playback.ts';
import type { ProbeSnapshot } from './browser-probes.ts';
import { frameWindow } from './mission-observations.ts';

// P2-12 S-03 and AC-04, P3-04 AC-14: resource balance of one document at the menu. A snapshot combines the browser
// probes, the audio probe and the resource cache's record keys; the comparison reports every difference from the same
// document's menu baseline rather than stopping at the first: listeners of every group (a `beforeunload` leave guard
// among them), observers, canvases, owned animation frames, Workers, pending one-shot timers, audio and the cache.
// Release is proven in the document that held the resources: a reload replaces the probes, so the old document's
// evidence is kept in the test process before a new baseline is taken. After exit, GPU release is the viewer canvas
// leaving the document with its context lost; the renderer's own counts are readable only while it is shown, so warm
// counts that stay equal round to round show nothing accumulates.

export type BalanceKind = 'document' | 'listener' | 'observer' | 'canvas' | 'frame' | 'worker' | 'timer' | 'audio' | 'cache' | 'gpu';

export interface BalanceProblem {
  readonly kind: BalanceKind;
  readonly detail: string;
}

/** The cache's record keys; package records add their own key, declared payload count, and each group's Asset IDs. */
export interface StoredCacheKeys {
  readonly packages: readonly {
    readonly key: unknown; readonly recordKey: unknown; readonly payloadCount: unknown;
    readonly groups: readonly { readonly group: unknown; readonly assets: readonly unknown[] }[];
  }[];
  readonly payloads: readonly unknown[];
}

/** A complete package as the test knows it independently: its key and each group's Asset IDs in definition order. */
export interface ExpectedPackage {
  readonly key: ResourceCacheKey;
  readonly groups: readonly { readonly group: string; readonly assets: readonly string[] }[];
}

/** The expected package of `key` holding the slice groups of `inputs`, read and ordered as the cache does. */
export function expectedPackage(key: ResourceCacheKey, inputs: readonly GroupInput[]): ExpectedPackage {
  return Object.freeze({
    key,
    groups: inDefinitionOrder(readGroupInputs(inputs, 'invalid-request'), 'invalid-request')
      .map(({ manifest }) => Object.freeze({ group: manifest.group, assets: Object.freeze(manifest.assets.map(({ id }) => id)) })),
  });
}

export interface BalanceSnapshot {
  readonly label: string;
  /** Taken after an idle window, whose owned frame requests `probe.frames` counts. */
  readonly probe: ProbeSnapshot;
  /** null when the page has no audio probe. */
  readonly audio: { readonly contexts: readonly AudioContextRecord[]; readonly routed: number } | null;
  /** null when the cache was not read. */
  readonly cache: StoredCacheKeys | null;
}

export interface BalanceExpectation {
  /**
   * Whether the page must have the audio probe (`installAudioProbe`), true by default: without it the check fails rather
   * than skipping audio. Pass false only where audio is outside the test's scope.
   */
  readonly audio?: boolean;
  /** Exactly these packages are stored, each with exactly its expected payloads and no other payload; omit to skip. */
  readonly packages?: readonly ExpectedPackage[];
}

export interface BalanceReport {
  readonly problems: readonly BalanceProblem[];
  /** Released canvases without `WEBGL_lose_context`, whose context loss is therefore not verified. */
  readonly unverifiedContextLoss: readonly number[];
  readonly snapshot: BalanceSnapshot;
}

const text = (value: unknown): string => JSON.stringify(value);

function difference(kind: BalanceKind, what: string, before: readonly string[], after: readonly string[]): BalanceProblem[] {
  const old = new Set(before);
  const now = new Set(after);
  return [
    ...after.filter(entry => !old.has(entry)).map(entry => ({ kind, detail: `${what} added since the baseline: ${entry}` })),
    ...before.filter(entry => !now.has(entry)).map(entry => ({ kind, detail: `${what} gone since the baseline: ${entry}` })),
  ];
}

/**
 * Active listeners of `group` by target, type, callback and phase; every group is compared, including unknown ones.
 * React DOM's own per-element listeners are compared separately.
 */
const listenerKeys = ({ listeners }: ProbeSnapshot, group: string): string[] =>
  listeners.filter(entry => entry.active && entry.group === group && entry.element !== 'react').map(entry => `${entry.target}:${entry.type}:${entry.id}:${entry.capture}`);

/**
 * React DOM's per-element listeners by type and count, on elements still in the document. React never removes them; an
 * element it unmounts takes them out of the document, and the menu renders new elements, so only counts can match.
 */
function reactElementKeys({ listeners }: ProbeSnapshot): string[] {
  const counts = new Map<string, number>();
  for (const { type } of listeners.filter(entry => entry.active && entry.element === 'react' && !entry.detached)) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts].map(([type, count]) => `${type} ×${count}`);
}

const observerKeys = ({ observers }: ProbeSnapshot): string[] =>
  observers.filter(({ targets }) => targets.length > 0).map(({ id, targets }) => `${id} on ${[...targets].sort((a, b) => a - b).join(',')}`);

/** The application's pending one-shot timers by ID and delay; one that fired or was cleared is no longer pending. */
const timerKeys = ({ timers }: ProbeSnapshot): string[] => timers.pending.map(({ id, delay }) => `${id} (${delay === null ? 'non-numeric delay' : `${delay} ms`})`);

/**
 * Workers of the whole document, each by ID: `terminate()`d exactly once and given at most one job. Job IDs are local to
 * the import owner, which a new import screen replaces, so equal IDs on different Workers are separate jobs. A Worker
 * without a job (its start failed before `ready`) is fine; a job whose construction threw has no Worker at all.
 */
function workerProblems({ workers }: ProbeSnapshot): BalanceProblem[] {
  return workers.flatMap(({ id, entry, terminations, jobs }): BalanceProblem[] => [
    ...(terminations === 1 ? [] : [{ kind: 'worker' as const, detail: `Worker ${id} (${entry}) was terminated ${terminations} times, not once` }]),
    ...(jobs.length <= 1 ? [] : [{ kind: 'worker' as const, detail: `Worker ${id} (${entry}) started jobs ${jobs.join(', ')}` }]),
  ]);
}

/** Closed means `close()` resolved: Chrome reports the `closed` state as soon as `close()` is called. */
function audioProblems(audio: BalanceSnapshot['audio'], required: boolean): BalanceProblem[] {
  if (audio === null) return required ? [{ kind: 'audio', detail: 'the page has no audio probe' }] : [];
  const problems: BalanceProblem[] = audio.contexts
    .filter(({ state, closes }) => state !== 'closed' || !closes.includes('resolved'))
    .map(({ id, state, closes }) => ({ kind: 'audio', detail: `AudioContext ${id} is ${state}; close(): ${closes.length > 0 ? closes.join(', ') : 'never called'}` }));
  if (audio.routed !== 0) problems.push({ kind: 'audio', detail: `${audio.routed} application audio nodes are still connected to a destination` });
  return problems;
}

/**
 * Packages are exactly `expected`, each record holding its own IndexedDB key, the expected groups' Asset IDs and their
 * count; payloads are exactly the expected packages' Assets, so a missing one is incomplete and any other an orphan.
 */
export function cacheProblems(stored: StoredCacheKeys, expected: readonly ExpectedPackage[]): BalanceProblem[] {
  const problems: BalanceProblem[] = [];
  const problem = (detail: string): void => { problems.push({ kind: 'cache', detail }); };
  const wanted = new Map(expected.map(entry => [text(packageRecordKey(entry.key)), entry]));
  const storedPayloads = new Set(stored.payloads.map(text));
  const expectedPayloads = new Set(expected.flatMap(({ key, groups }) => groups.flatMap(({ assets }) => assets.map(id => text(payloadRecordKey(key, id))))));
  const seen = new Set<string>();
  for (const { key, recordKey, payloadCount, groups } of stored.packages) {
    const name = text(key);
    seen.add(name);
    const entry = wanted.get(name);
    if (!entry) {
      problem(`unexpected package ${name}`);
      continue;
    }
    const own = typeof recordKey === 'object' && recordKey !== null ? text(packageRecordKey(recordKey as ResourceCacheKey)) : null;
    if (own !== name) problem(`package ${name} holds the record key ${text(recordKey)}`);
    if (text(groups) !== text(entry.groups)) problem(`package ${name} holds groups ${text(groups)}, not the expected manifests`);
    const count = entry.groups.reduce((sum, { assets }) => sum + assets.length, 0);
    if (payloadCount !== count) problem(`package ${name} declares ${text(payloadCount)} payloads, not ${count}`);
    for (const { assets } of entry.groups) {
      for (const id of assets) if (!storedPayloads.has(text(payloadRecordKey(entry.key, id)))) problem(`package ${name} misses the payload of ${id}`);
    }
  }
  for (const name of wanted.keys()) if (!seen.has(name)) problem(`missing package ${name}`);
  for (const key of stored.payloads) if (!expectedPayloads.has(text(key))) problem(`orphan payload ${text(key)}`);
  return problems;
}

/**
 * Every difference of `current` from the same document's `baseline`: listeners of every group, observed targets,
 * connected canvases and lost contexts, owned frames in the idle window, Workers, pending timers, audio and, when
 * expected, the cache.
 */
export function compareBalance(baseline: BalanceSnapshot, current: BalanceSnapshot, expectation: BalanceExpectation = {}): Pick<BalanceReport, 'problems' | 'unverifiedContextLoss'> {
  const { probe: before } = baseline;
  const { probe: after } = current;
  if (before.document !== after.document) {
    return { problems: [{ kind: 'document', detail: `document ${after.document} replaced the baseline's ${before.document}` }], unverifiedContextLoss: [] };
  }
  const problems: BalanceProblem[] = [];
  const groups = new Set([...before.listeners, ...after.listeners].map(({ group }) => group));
  for (const group of [...groups].sort()) problems.push(...difference('listener', `${group} listener`, listenerKeys(before, group), listenerKeys(after, group)));
  problems.push(...difference('listener', 'attached React element listeners', reactElementKeys(before), reactElementKeys(after)));
  problems.push(...difference('observer', 'observer', observerKeys(before), observerKeys(after)));
  const connected = ({ canvases }: ProbeSnapshot) => canvases.filter(({ connected }) => connected).map(({ id }) => `canvas ${id}`);
  problems.push(...difference('canvas', 'connected', connected(before), connected(after)));
  const released = after.canvases.filter(({ connected }) => !connected);
  for (const { id } of released.filter(({ extension, lost }) => extension && !lost)) problems.push({ kind: 'canvas', detail: `canvas ${id} is released but its context is not lost` });
  // The window starts with the frames already pending, so a one-shot frame delivered during it is not idle either.
  const { pending, maximum, requested } = after.frames;
  if (maximum !== 0) problems.push({ kind: 'frame', detail: `up to ${maximum} owned frames pending, ${pending} at the end, and ${requested} requested in the idle window` });
  problems.push(...workerProblems(after));
  problems.push(...difference('timer', 'pending timer', timerKeys(before), timerKeys(after)));
  problems.push(...audioProblems(current.audio, expectation.audio ?? true));
  if (expectation.packages) {
    if (current.cache === null) problems.push({ kind: 'cache', detail: 'the cache was not read' });
    else problems.push(...cacheProblems(current.cache, expectation.packages));
  }
  return { problems, unverifiedContextLoss: released.filter(({ extension }) => !extension).map(({ id }) => id) };
}

/** A warm item's GPU counts must equal its first; missing diagnostics are a failure, not a skip. */
export function warmProblems(first: readonly number[] | undefined, item: string, gpu: readonly number[] | null): BalanceProblem[] {
  if (gpu === null) return [{ kind: 'gpu', detail: `${item} has no GPU diagnostics` }];
  if (first !== undefined && text(first) !== text(gpu)) return [{ kind: 'gpu', detail: `${item} holds ${text(gpu)}, not its first ${text(first)}` }];
  return [];
}

/**
 * The cache's record keys through a separate read-only connection, using the adapter's exported constants. A missing
 * database is empty: an upgrade is aborted, so reading never creates one.
 */
export async function readCacheKeys(page: Page): Promise<StoredCacheKeys> {
  return page.evaluate(async ({ name, packageStore, payloadStore }) => {
    if (typeof indexedDB?.databases !== 'function') throw new Error('IndexedDB, or listing its databases, is unavailable');
    if (!(await indexedDB.databases()).some(database => database.name === name)) return { packages: [], payloads: [] };
    const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(name);
      let created = false;
      request.onupgradeneeded = () => { created = true; request.transaction?.abort(); };
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { if (created) resolve(null); else reject(request.error); };
    });
    if (db === null) return { packages: [], payloads: [] };
    try {
      const transaction = db.transaction([packageStore, payloadStore], 'readonly');
      const packageKeys = transaction.objectStore(packageStore).getAllKeys();
      const packageValues = transaction.objectStore(packageStore).getAll();
      const payloadKeys = transaction.objectStore(payloadStore).getAllKeys();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => { resolve(); };
        transaction.onabort = () => { reject(transaction.error); };
      });
      const field = (value: unknown, key: string): unknown => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined);
      return {
        packages: packageKeys.result.map((key, index) => {
          const record = packageValues.result[index];
          const groups = field(record, 'groups');
          return {
            key, recordKey: field(record, 'key') ?? null, payloadCount: field(record, 'payloadCount') ?? null,
            groups: (Array.isArray(groups) ? groups : []).map(group => {
              const manifest = field(group, 'manifest');
              const assets = field(manifest, 'assets');
              return { group: field(manifest, 'group') ?? null, assets: Array.isArray(assets) ? assets.map(asset => field(asset, 'id') ?? null) : [] };
            }),
          };
        }),
        payloads: payloadKeys.result,
      };
    } finally {
      db.close();
    }
  }, RESOURCE_CACHE_DATABASE);
}

/** One balance snapshot: the probes after an idle window, then audio, and the cache keys (read meanwhile) when `cache`. */
async function readBalance(page: Page, label: string, cache: boolean): Promise<BalanceSnapshot> {
  const [probe, keys] = await Promise.all([frameWindow(page), cache ? readCacheKeys(page) : null]);
  const audio = await page.evaluate(() => {
    const sounds = typeof window.osrAudioProbe?.records === 'function' ? window.osrAudioProbe : null;
    return sounds && { contexts: sounds.records(), routed: sounds.routed() };
  });
  return { label, probe, audio, cache: keys };
}

/**
 * Lets Playwright set up its own listeners in the page's current document before a menu baseline: its main-world
 * script, created on first use and kept for the document, registers capture listeners on `window` that the probes
 * count as test registrations.
 */
export const settleTooling = (page: Page): Promise<void> => page.locator('body').evaluate(() => undefined);

/**
 * Resource balance of one page across its documents. `start` takes the menu baseline; `check` waits up to its timeout
 * for the page to return to it. Before a reload, `beforeReload` checks and keeps the release evidence; after it,
 * `rebaseline` takes the new document's baseline, and refuses to unless that evidence was kept. All reports stay in the
 * test process and `attach` adds them to the test.
 */
export class ResourceBalance {
  readonly #page: Page;
  readonly #testInfo: TestInfo;
  #expectation: BalanceExpectation;
  #baseline: BalanceSnapshot;
  #released = false;
  readonly #baselines: BalanceSnapshot[] = [];
  readonly #reports: BalanceReport[] = [];
  readonly #warm: { item: string; document: string; gpu: readonly number[] | null }[] = [];

  private constructor(page: Page, testInfo: TestInfo, expectation: BalanceExpectation, baseline: BalanceSnapshot) {
    this.#page = page;
    this.#testInfo = testInfo;
    this.#expectation = expectation;
    this.#baseline = baseline;
    this.#baselines.push(baseline);
  }

  /** Takes the baseline of the page's current document, which should show the settled menu. */
  static async start(page: Page, testInfo: TestInfo, expectation: BalanceExpectation = {}): Promise<ResourceBalance> {
    return new ResourceBalance(page, testInfo, expectation, await readBalance(page, 'baseline', expectation.packages !== undefined));
  }

  get document(): string {
    return this.#baseline.probe.document;
  }

  /** Replaces the expected packages, as after a commit; `undefined` stops reading the cache. */
  expectPackages(packages: readonly ExpectedPackage[] | undefined): void {
    this.#expectation = { ...this.#expectation, packages };
  }

  /** Waits up to `timeout` ms for no difference from the baseline and reports the last snapshot; never fails itself. */
  async measure(label: string, timeout = 5_000): Promise<BalanceReport> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const snapshot = await readBalance(this.#page, label, this.#expectation.packages !== undefined);
      const { problems, unverifiedContextLoss } = compareBalance(this.#baseline, snapshot, this.#expectation);
      const settled = problems.length === 0 || problems.some(({ kind }) => kind === 'document') || Date.now() >= deadline;
      if (settled) {
        const report = { problems, unverifiedContextLoss, snapshot };
        this.#reports.push(report);
        return report;
      }
    }
  }

  /** `measure`, then fails on any difference; released canvases lacking `WEBGL_lose_context` are annotated, not passed. */
  async check(label: string, timeout?: number): Promise<BalanceReport> {
    const report = await this.measure(label, timeout);
    if (report.unverifiedContextLoss.length > 0) this.#testInfo.annotations.push({
      type: 'context-loss-capability',
      description: `${label}: canvases ${report.unverifiedContextLoss.join(', ')} lack WEBGL_lose_context; their context loss is not verified.`,
    });
    expect(report.problems, `${label}: resource balance`).toEqual([]);
    return report;
  }

  /** `check` in the document about to be replaced, and keeps its result as that document's release evidence. */
  async beforeReload(label = 'before reload'): Promise<BalanceReport> {
    const report = await this.check(label);
    this.#released = true;
    return report;
  }

  /** Takes the new document's baseline; the replaced document must have passed `beforeReload`. */
  async rebaseline(label = 'baseline after reload'): Promise<void> {
    const snapshot = await readBalance(this.#page, label, this.#expectation.packages !== undefined);
    if (snapshot.probe.document === this.document) throw new Error(`${label}: the document was not replaced; keep its baseline`);
    if (!this.#released) throw new Error(`${label}: the release evidence of document ${this.document} was not kept before it was replaced`);
    this.#baseline = snapshot;
    this.#baselines.push(snapshot);
    this.#released = false;
  }

  /** Records `item`'s GPU counts while it is shown warm; every later round in the same document must equal the first. */
  warm(item: string, gpu: readonly number[] | null): void {
    const { document } = this;
    const first = this.#warm.find(entry => entry.document === document && entry.item === item && entry.gpu !== null)?.gpu ?? undefined;
    this.#warm.push({ item, document, gpu });
    expect(warmProblems(first, item, gpu), `${item}: warm GPU counts`).toEqual([]);
  }

  /** Attaches every baseline, report and warm reading, by document. */
  async attach(name = 'resource-balance'): Promise<void> {
    await this.#testInfo.attach(name, {
      body: JSON.stringify({ baselines: this.#baselines, reports: this.#reports, warm: this.#warm }),
      contentType: 'application/json',
    });
  }
}

import { expect, type Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { GroupInput } from '../../src/content/completeness.ts';
import { asciiBytes } from '../../src/content/graphics/graphics-format.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import { sha256Fingerprint } from '../../src/content/sha256.ts';
import { RESOURCE_CACHE_DATABASE } from '../../src/platform/storage/resource-cache-records.ts';
import {
  CANARY_ASSET, CANARY_TEXT, canaryCoveredFiles, canaryMarkerBytes, canaryProductionSizedFiles, containsBytes,
} from '../../src/workers/canary.test-support.ts';
import { IMPORT_SCENARIOS } from '../../src/workers/import-scenarios.test-support.ts';
import { MARKER, syntheticImport } from '../../src/workers/synthetic-import.test-support.ts';
import { discFiles, type FilePayload } from './app-entry.ts';
import type { SeededPackage } from './production-cache.ts';

// P2-12 network canaries (spec, network audit; subtask 05): the synthetic markers that must never leave the browser,
// with the proof that each reached the input, the converted payload or the cache. A marker bears witness only for the
// stages it is proven to reach. The `canary` Worker scenario imports `canaryFiles()` on the development test entry; the
// production project imports `canaryProductionFiles()` and seeds `canaryPackage()` with `seedProductionCache`.

/** Where a marker is: the chosen files, the converted payload or package identity, or the stored cache records. */
export type CanaryStage = 'input' | 'payload' | 'cache';

export interface CanaryMarker {
  readonly name: 'file-name' | 'content-text' | 'payload-bytes' | 'payload-sha256' | 'source-fingerprint' | 'manifest-identity';
  readonly bytes: Uint8Array;
  /** The marker as text when it is printable ASCII; null for the byte marker. */
  readonly text: string | null;
  readonly stages: readonly CanaryStage[];
}

/** The markers of one project's canary run, for the network audit and the arrival proofs. */
export interface CanarySet {
  readonly markers: readonly CanaryMarker[];
}

const textMarker = (name: CanaryMarker['name'], text: string, stages: readonly CanaryStage[]): CanaryMarker =>
  Object.freeze({ name, bytes: asciiBytes(text), text, stages: Object.freeze([...stages]) });

/** The canary slice disc's files, whose names carry the file-name marker. */
export const canaryFiles = (): Promise<FilePayload[]> => discFiles(canaryCoveredFiles());

/** The production-sized synthetic files with the canary in the file the production job hashes first. */
export const canaryProductionFiles = (): Promise<FilePayload[]> => discFiles(canaryProductionSizedFiles());

let converted: Promise<readonly HeldGroup[]> | undefined;
/** The groups the `canary` scenario sends, converted in Node by the same job on the same disc; computed once per worker process. */
export function canaryPackage(): Promise<readonly HeldGroup[]> {
  return converted ??= (async () => {
    const { files } = await syntheticImport(canaryCoveredFiles());
    const groups: HeldGroup[] = [];
    await IMPORT_SCENARIOS.canary()(files.map(file => ({ name: file.name, blob: file })), {
      progress: () => undefined,
      identified: () => undefined,
      group: (group, input) => { groups.push(Object.freeze({ group, ...input })); },
    });
    return Object.freeze(groups);
  })();
}

/** The canary Asset's payload bytes, its descriptor's payload fingerprint and the package identity of `groups`. */
function canaryPayload(groups: readonly GroupInput[]) {
  const audio = groups.map(({ manifest, payloads }) => ({ manifest: readGroupManifest(manifest), payloads }))
    .find(({ manifest }) => manifest.group === 'audio');
  if (!audio) throw new Error('The package has no audio group');
  const descriptor = audio.manifest.assets.find(({ id }) => id === CANARY_ASSET);
  const payload = readPayloadRecords(audio.payloads).find(({ id }) => id === CANARY_ASSET);
  if (!descriptor || !payload) throw new Error(`The audio group has no ${CANARY_ASSET}`);
  return { bytes: payload.bytes, fingerprint: descriptor.payloadIdentity.fingerprint, identity: audio.manifest.identity };
}

/** The canary markers of a package that holds the canary payload, apart from the file name. */
function packageMarkers(groups: readonly GroupInput[], inputStages: readonly CanaryStage[]): CanaryMarker[] {
  const { fingerprint, identity } = canaryPayload(groups);
  const content: readonly CanaryStage[] = [...inputStages, 'payload', 'cache'];
  if (identity.origin.type !== 'original-import') throw new Error('The canary package must be an original import');
  return [
    textMarker('content-text', CANARY_TEXT, content),
    Object.freeze({ name: 'payload-bytes', bytes: canaryMarkerBytes(), text: null, stages: Object.freeze(content) }),
    // The bare digest, as well as its `sha256:` form.
    textMarker('payload-sha256', fingerprint.slice('sha256:'.length), ['payload', 'cache']),
    textMarker('source-fingerprint', identity.origin.sourceFingerprint, ['payload', 'cache']),
    textMarker('manifest-identity', identity.manifestIdentity, ['payload', 'cache']),
  ];
}

/** The development project's markers: the canary disc as imported by the `canary` scenario and committed. */
export async function developmentCanaries(): Promise<CanarySet> {
  return Object.freeze({
    markers: Object.freeze([textMarker('file-name', MARKER, ['input']), ...packageMarkers(await canaryPackage(), ['input'])]),
  });
}

/**
 * The production project's markers: the production-sized files carry the file name, text and byte markers as input
 * only, since identification rejects them; the seeded canary package carries the payload, identity and cache markers.
 */
export function productionCanaries(seeded: SeededPackage): CanarySet {
  return Object.freeze({ markers: Object.freeze([textMarker('file-name', MARKER, ['input']), ...packageMarkers(seeded.groups, ['input'])]) });
}

/** The markers that bear witness for `stage`. */
export const markersFor = (set: CanarySet, stage: CanaryStage): readonly CanaryMarker[] => set.markers.filter(({ stages }) => stages.includes(stage));

/** Proves every input marker is in the chosen files: the file name in a name, the others in the bytes. */
export function expectInputArrival(files: readonly FilePayload[], set: CanarySet): void {
  for (const marker of markersFor(set, 'input')) {
    const found = marker.name === 'file-name'
      ? files.some(({ name }) => name.includes(marker.text!))
      : files.some(({ buffer }) => containsBytes(buffer, marker.bytes));
    expect(found, `input marker ${marker.name}`).toBe(true);
  }
}

/** Proves every payload marker is in the package: the canary payload's bytes and digest, and the package identity. */
export function expectPayloadArrival(groups: readonly GroupInput[], set: CanarySet): void {
  const { bytes, fingerprint, identity } = canaryPayload(groups);
  expect(fingerprint).toBe(sha256Fingerprint(bytes));
  const texts = [fingerprint, identity.manifestIdentity, identity.origin.type === 'original-import' ? identity.origin.sourceFingerprint : ''];
  for (const marker of markersFor(set, 'payload')) {
    const found = marker.name === 'content-text' || marker.name === 'payload-bytes'
      ? containsBytes(bytes, marker.bytes)
      : texts.some(text => text.includes(marker.text!));
    expect(found, `payload marker ${marker.name}`).toBe(true);
  }
}

/**
 * Proves every cache marker is in the page's stored records: the content markers in a stored payload, the others in a
 * package record. Reads the cache database without the app's modules, so it also works on the production preview.
 */
export async function expectCacheArrival(page: Page, set: CanarySet): Promise<void> {
  const markers = markersFor(set, 'cache');
  const found = await page.evaluate(async ({ database, markers }) => {
    const { name, packageStore, payloadStore } = database;
    if (!(await indexedDB.databases()).some(entry => entry.name === name)) return markers.map(() => false);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(request.error); };
    });
    try {
      const all = (store: string) => new Promise<unknown[]>((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly');
        const values = transaction.objectStore(store).getAll();
        transaction.oncomplete = () => { resolve(values.result); };
        transaction.onabort = () => { reject(transaction.error); };
      });
      const records = (await all(packageStore)).map(record => JSON.stringify(record));
      const payloads = (await all(payloadStore)).map(value => {
        const { bytes } = value as { readonly bytes?: unknown };
        return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(0);
      });
      const holds = (bytes: Uint8Array, marker: readonly number[]) =>
        bytes.some((_, start) => start + marker.length <= bytes.length && marker.every((byte, index) => bytes[start + index] === byte));
      return markers.map(({ content, bytes, text }) => (content
        ? payloads.some(payload => holds(payload, bytes))
        : records.some(record => record.includes(text!))));
    } finally {
      db.close();
    }
  }, {
    database: RESOURCE_CACHE_DATABASE,
    markers: markers.map(({ name, bytes, text }) => ({ content: name === 'content-text' || name === 'payload-bytes', bytes: [...bytes], text })),
  });
  markers.forEach((marker, index) => expect(found[index], `cache marker ${marker.name}`).toBe(true));
}

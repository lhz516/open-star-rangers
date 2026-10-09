import { vi } from 'vitest';
import type { ResourceGroup } from '../../content/asset-contract.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { validatePackage, type GroupInput } from '../../content/completeness.ts';
import { readConverterVersion, readSourceFingerprint, type ContentIdentity } from '../../content/content-identity.ts';
import { LOGIC_PAYLOAD_SCHEMA_VERSION, type LogicRole } from '../../content/logic/logic-content.ts';
import { LOGIC_IDS, syntheticCraftTypes, syntheticMission, syntheticRoster } from '../../content/logic/logic-content.test-support.ts';
import { encodeLogicPayload } from '../../content/logic/logic-payload.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords } from '../../content/payload.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { readSourceStateSet } from '../../content/source-state.ts';
import { syntheticGroup, syntheticSourceGroup } from '../../content/synthetic-content.test-support.ts';
import {
  cacheKeyOf, type CacheEntry, type CacheEntryStatus, type CapacityCheckResult, type CommitResult, type ListResult, type ResourceCacheKey,
  type RestoreResult,
} from '../../platform/storage/resource-cache-contract.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from '../../workers/production-package.ts';
import type { ImportedGroup, ImportGroupSummary, ImportJobOwner, ImportJobSnapshot } from '../import/import-job-owner.ts';
import { createResourceHolder, type ResourceCachePort, type ResourceHolderOptions } from './resource-holder.ts';

// Node test support for the resource holder: synthetic groups of one original import, fake finished jobs and a cache
// whose every operation the test settles.

export const SYNTHETIC_FINGERPRINT = readSourceFingerprint(`source:sha256:${'ab'.repeat(32)}`);
const IDENTITY = Object.freeze({ versionId: 'synthetic-disc', sourceFingerprint: SYNTHETIC_FINGERPRINT });

/** The expected profile of the synthetic groups below, with the production package budget. */
export const SYNTHETIC_PROFILE: ExpectedPackageProfile = Object.freeze({
  converterVersion: readConverterVersion('synthetic-converter.1'),
  sourceFingerprint: SYNTHETIC_FINGERPRINT,
  limits: PRODUCTION_PACKAGE.limits,
});

/** The synthetic logic content's craft models, renamed to the synthetic models group's Asset IDs. */
const MODEL_IDS: Readonly<Record<string, string>> = Object.freeze({
  'model/player-ship': 'model/synthetic-player',
  'model/enemy-ship-1': 'model/synthetic-enemy-a',
  'model/enemy-ship-2': 'model/synthetic-enemy-b',
  'model/base-1': 'model/synthetic-base',
});

/** The synthetic craft type table, its models renamed to the synthetic models group's. */
export function packageCraftTypes() {
  const table = syntheticCraftTypes();
  return { entries: table.entries.map(entry => ({ ...entry, model: { ...entry.model, id: MODEL_IDS[entry.model.id] } })) };
}

export interface LogicContents {
  readonly mission?: unknown;
  readonly craftTypes?: ReturnType<typeof packageCraftTypes>;
  /** Replaces the mission payload bytes, which the manifest then describes. */
  readonly missionBytes?: Uint8Array;
  /** Roles that get a second Asset with the same content under the ID suffixed `-copy`, which nothing references. */
  readonly duplicates?: readonly ('craft-types' | 'wingman-roster')[];
}

/**
 * A logic group of real logic payloads (mission, craft types and wingman roster) bound to `SYNTHETIC_FINGERPRINT`,
 * whose craft types use the synthetic models group's models; the mission and the table default to the synthetic logic content.
 */
export function logicGroupInput(
  { mission = syntheticMission(), craftTypes = packageCraftTypes(), missionBytes, duplicates = [] }: LogicContents = {},
): GroupInput {
  const asset = (role: LogicRole, id: string, content: unknown, dependencies: readonly string[]) =>
    ({ id, role, dependencies, schemaVersion: LOGIC_PAYLOAD_SCHEMA_VERSION, bytes: encodeLogicPayload({ role, content } as Parameters<typeof encodeLogicPayload>[0]) });
  const models = [...new Set(craftTypes.entries.map(({ model }) => model.id))].sort();
  const tables = (id: string) => asset('craft-types', id, craftTypes, models);
  const rosters = (id: string) => asset('wingman-roster', id, syntheticRoster(), [LOGIC_IDS.craftTypes]);
  const specs = [
    tables(LOGIC_IDS.craftTypes),
    rosters(LOGIC_IDS.wingmanRoster),
    ...duplicates.map(role => (role === 'craft-types' ? tables(`${LOGIC_IDS.craftTypes}-copy`) : rosters(`${LOGIC_IDS.wingmanRoster}-copy`))),
    { ...asset('mission', LOGIC_IDS.mission, mission, [LOGIC_IDS.craftTypes, LOGIC_IDS.wingmanRoster]), ...(missionBytes ? { bytes: missionBytes } : {}) },
  ].sort((left, right) => (left.id < right.id ? -1 : 1));
  const input = syntheticGroup('logic', specs, { origin: { type: 'original-import', sourceFingerprint: SYNTHETIC_FINGERPRINT } });
  input.sources = { sourceFingerprint: SYNTHETIC_FINGERPRINT, states: specs.map(({ id }) => ({ id, state: 'verified', unknowns: [] as string[] })) };
  return input;
}

/**
 * A group as the job owner hands it over, bound to `SYNTHETIC_FINGERPRINT` and frozen: by default the logic group of
 * real logic payloads, or the synthetic group of the other kinds.
 */
export const imported = (
  group: ResourceGroup,
  input: GroupInput = group === 'logic' ? logicGroupInput() : syntheticSourceGroup(group, SYNTHETIC_FINGERPRINT),
): ImportedGroup => Object.freeze({ group, manifest: input.manifest, payloads: input.payloads, sources: input.sources });

/** All four groups of one complete package, in slice definition order. */
export const allGroups = (): ImportedGroup[] => CLASSIC_P2_SLICE.groups.map(group => imported(group));

const completeSummary = ({ group, manifest }: ImportedGroup): ImportGroupSummary =>
  ({ group, status: 'group-complete', assets: (manifest as { readonly assets: readonly unknown[] }).assets.length, diagnostics: [] });

export const incompleteSummary = (group: ResourceGroup): ImportGroupSummary => ({
  group, status: 'incomplete', assets: null,
  diagnostics: [{ code: 'payload-missing', path: 'payloads', assetId: null, unknowns: [], reason: 'is missing' }],
});

export type FakeJob = Pick<ImportJobOwner, 'getSnapshot' | 'takeGroups'> & { readonly takeGroups: ReturnType<typeof vi.fn> };

/** A job owner whose job ended with `snapshot`; on `finished` it hands `groups` over once, like the real owner. */
export function fakeJob(snapshot: ImportJobSnapshot, groups: readonly ImportedGroup[] = []): FakeJob {
  let taken = false;
  return {
    getSnapshot: () => snapshot,
    takeGroups: vi.fn(() => {
      if (snapshot.status !== 'finished' || taken) return null;
      taken = true;
      return Object.freeze([...groups]);
    }),
  };
}

/** A finished job whose complete groups are `groups`, plus the incomplete summaries `incomplete`. */
export function finishedJob(groups: readonly ImportedGroup[], incomplete: readonly ImportGroupSummary[] = []): FakeJob {
  const summaries = [...groups.map(completeSummary), ...incomplete];
  return fakeJob({ status: 'finished', jobId: 1, identity: IDENTITY, groups: summaries, usage: EMPTY_BUDGET_USAGE }, groups);
}

/** The identity of a complete package of `groups`. */
export function identityOf(groups: readonly GroupInput[]): ContentIdentity {
  const result = validatePackage(CLASSIC_P2_SLICE, groups);
  if (result.status !== 'complete') throw new Error('the groups are not a complete package');
  return result.identity;
}

export const listed = (...entries: readonly CacheEntry[]): ListResult => ({ status: 'listed', entries });

/** A listed entry for `identity`; only a compatible one carries its identity. */
export const entryFor = (identity: ContentIdentity, status: CacheEntryStatus = 'compatible'): CacheEntry =>
  ({ key: cacheKeyOf(identity), status, identity: status === 'compatible' ? identity : null, payloadBytes: status === 'compatible' ? 1 : null });

export const committed = (groups: readonly GroupInput[]): CommitResult => {
  const identity = identityOf(groups);
  return { status: 'committed', key: cacheKeyOf(identity), identity, payloadCount: 0, payloadBytes: 0 };
};

/** The restore result of `groups`, read as the cache returns them; `identity` defaults to the groups' own. */
export function restored(groups: readonly GroupInput[], identity = identityOf(groups)): RestoreResult {
  return {
    status: 'restored',
    key: cacheKeyOf(identity),
    identity,
    groups: groups.map(({ manifest, payloads, sources }, index) => ({
      manifest: readGroupManifest(manifest, `groups[${index}].manifest`),
      payloads: readPayloadRecords(payloads, `groups[${index}].payloads`),
      sources: sources === null ? null : readSourceStateSet(sources, `groups[${index}].sources`),
    })),
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** A cache whose list, commit and restore calls stay pending until the test settles their recorded promises. */
export class FakeCache implements ResourceCachePort {
  readonly lists: Deferred<ListResult>[] = [];
  readonly commits: { readonly inputs: readonly GroupInput[]; readonly limits: BudgetRecord; readonly signal: AbortSignal; readonly result: Deferred<CommitResult> }[] = [];
  readonly restores: { readonly key: ResourceCacheKey; readonly limits: BudgetRecord; readonly result: Deferred<RestoreResult> }[] = [];
  readonly capacityRequests: number[] = [];
  capacity: CapacityCheckResult = { status: 'unknown', requiredBytes: 0 };

  checkCapacity(requiredBytes: number): Promise<CapacityCheckResult> {
    this.capacityRequests.push(requiredBytes);
    return Promise.resolve(this.capacity);
  }

  commit(inputs: readonly GroupInput[], limits: BudgetRecord, { signal }: { readonly signal: AbortSignal }): Promise<CommitResult> {
    const result = deferred<CommitResult>();
    this.commits.push({ inputs, limits, signal, result });
    return result.promise;
  }

  list(): Promise<ListResult> {
    const result = deferred<ListResult>();
    this.lists.push(result);
    return result.promise;
  }

  restore(key: ResourceCacheKey, limits: BudgetRecord): Promise<RestoreResult> {
    const result = deferred<RestoreResult>();
    this.restores.push({ key, limits, result });
    return result.promise;
  }
}

/** Lets every settled promise run its reactions. */
export const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** A holder with a fake cache, the synthetic profile and a page clock the test advances. */
export function testHolder(options: Partial<ResourceHolderOptions> = {}) {
  const cache = new FakeCache();
  const reportError = vi.fn();
  const clock = { time: 0 };
  const holder = createResourceHolder({ cache, profile: SYNTHETIC_PROFILE, now: () => clock.time, reportError, ...options });
  return { holder, cache, reportError, clock };
}
